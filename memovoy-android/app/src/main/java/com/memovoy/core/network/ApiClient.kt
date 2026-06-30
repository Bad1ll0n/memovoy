// com/memovoy/core/network/ApiClient.kt
package com.memovoy.core.network

import com.memovoy.BuildConfig
import com.memovoy.core.auth.TokenRepository
import com.memovoy.core.models.RefreshResponse
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.logging.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

// ---------------------------------------------------------------------------
// Erros tipados
// ---------------------------------------------------------------------------

sealed class ApiError(message: String) : Exception(message) {
    data object Unauthorized             : ApiError("Sessão expirada. Faz login novamente.")
    data class Forbidden(val msg: String): ApiError(msg)
    data class NotFound(val msg: String) : ApiError(msg)
    data class Conflict(val msg: String) : ApiError(msg)
    data class Validation(val msg: String, val details: String? = null) : ApiError(msg)
    data class ServerError(val code: Int, val msg: String) : ApiError(msg)
    data class NetworkError(val cause: Throwable) : ApiError(cause.message ?: "Sem ligação")
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

@Singleton
class ApiClient @Inject constructor(
    private val tokenRepository: TokenRepository,
) {
    private val baseUrl = BuildConfig.API_BASE_URL

    // Certificate pinning — dois pins: atual + backup
    // Em debug mode os pins são ignorados (emulador usa certificado auto-signed)
    private val certificatePinner = if (BuildConfig.DEBUG) {
        null
    } else {
        CertificatePinner.Builder()
            .add("api.memovoy.com", BuildConfig.CERT_PIN_CURRENT)
            .add("api.memovoy.com", BuildConfig.CERT_PIN_BACKUP)
            .build()
    }

    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .apply { certificatePinner?.let { certificatePinner(it) } }
        .build()

    private val json = Json {
        ignoreUnknownKeys   = true   // tolerante a campos novos da API
        isLenient           = true
        coerceInputValues   = true   // null → default value em campos não-nullable
        encodeDefaults      = false
    }

    private val httpClient = HttpClient(OkHttp) {
        engine { preconfigured = okHttpClient }

        install(ContentNegotiation) { json(json) }

        install(HttpTimeout) {
            requestTimeoutMillis  = 30_000
            connectTimeoutMillis  = 15_000
        }

        install(Logging) {
            level  = if (BuildConfig.DEBUG) LogLevel.BODY else LogLevel.NONE
            logger = Logger.ANDROID
        }

        // Injectar headers padrão em todos os pedidos
        install(DefaultRequest) {
            header(HttpHeaders.ContentType,   ContentType.Application.Json)
            header(HttpHeaders.Accept,        ContentType.Application.Json)
            header("User-Agent",              "MemoVoy-Android/1.0")
        }
    }

    // Mutex para serializar o refresh — evita múltiplos refreshes simultâneos
    private val refreshMutex = Mutex()
    private var isRefreshing = false

    // ---------------------------------------------------------------------------
    // API pública
    // ---------------------------------------------------------------------------

    suspend inline fun <reified T> get(
        path:   String,
        params: Map<String, Any?> = emptyMap(),
    ): T = execute(path, HttpMethod.Get, params = params)

    suspend inline fun <reified T> post(
        path:   String,
        body:   Any? = null,
    ): T = execute(path, HttpMethod.Post, body = body)

    suspend inline fun <reified T> patch(
        path:   String,
        body:   Any? = null,
    ): T = execute(path, HttpMethod.Patch, body = body)

    suspend fun delete(path: String): Unit = execute(path, HttpMethod.Delete)

    // ---------------------------------------------------------------------------
    // Execução com retry e refresh automático
    // ---------------------------------------------------------------------------

    suspend inline fun <reified T> execute(
        path:       String,
        method:     HttpMethod,
        body:       Any?             = null,
        params:     Map<String, Any?> = emptyMap(),
        retryCount: Int              = 0,
    ): T {
        val token = tokenRepository.accessToken()

        val response = try {
            httpClient.request("$baseUrl$path") {
                this.method = method
                // Access token
                token?.let { header(HttpHeaders.Authorization, "Bearer $it") }
                // Query params
                params.forEach { (k, v) -> if (v != null) parameter(k, v.toString()) }
                // Body
                if (body != null) setBody(body)
            }
        } catch (e: Exception) {
            throw ApiError.NetworkError(e)
        }

        // Sucesso
        if (response.status.isSuccess()) {
            return if (T::class == Unit::class) Unit as T
            else response.body()
        }

        // 401 — tentar refresh uma vez
        if (response.status == HttpStatusCode.Unauthorized && retryCount == 0) {
            val newToken = refreshToken()
            // Re-executar com novo token
            return execute(path, method, body, params, retryCount = 1)
        }

        // Outros erros
        throw parseError(response)
    }

    // ---------------------------------------------------------------------------
    // Refresh token
    // ---------------------------------------------------------------------------

    private suspend fun refreshToken(): String {
        refreshMutex.withLock {
            // Se já foi refrescado enquanto esperávamos pelo lock, usar o novo token
            val existing = tokenRepository.accessToken()
            if (existing != null && !isRefreshing) return existing

            isRefreshing = true
            try {
                val response: RefreshResponse = execute(
                    "/auth/refresh", HttpMethod.Post, retryCount = 1
                )
                tokenRepository.saveAccessToken(response.accessToken)
                isRefreshing = false
                return response.accessToken
            } catch (e: Exception) {
                isRefreshing = false
                tokenRepository.clear()
                throw ApiError.Unauthorized
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Parse de erros
    // ---------------------------------------------------------------------------

    private suspend fun parseError(response: HttpResponse): ApiError {
        val body = try { response.bodyAsText() } catch (_: Exception) { "" }
        val message = extractMessage(body) ?: response.status.description

        return when (response.status.value) {
            400  -> ApiError.Validation(message)
            401  -> ApiError.Unauthorized
            403  -> ApiError.Forbidden(message)
            404  -> ApiError.NotFound(message)
            409  -> ApiError.Conflict(message)
            else -> ApiError.ServerError(response.status.value, message)
        }
    }

    private fun extractMessage(body: String): String? = try {
        // { "error": { "message": "..." } }
        val idx = body.indexOf("\"message\"")
        if (idx < 0) return null
        val start = body.indexOf('"', idx + 10) + 1
        val end   = body.indexOf('"', start)
        if (start > 0 && end > start) body.substring(start, end) else null
    } catch (_: Exception) { null }
}
