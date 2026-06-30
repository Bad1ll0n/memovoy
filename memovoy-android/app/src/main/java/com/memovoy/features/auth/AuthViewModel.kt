// com/memovoy/features/auth/AuthViewModel.kt
package com.memovoy.features.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.memovoy.core.auth.TokenRepository
import com.memovoy.core.models.AuthResponse
import com.memovoy.core.network.ApiClient
import com.memovoy.core.network.ApiError
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

data class AuthUiState(
    val isLoading:       Boolean      = false,
    val isAuthenticated: Boolean      = false,
    val currentUserId:   String?      = null,
    val currentUsername: String?      = null,
    val error:           String?      = null,
)

sealed interface AuthEvent {
    data object NavigateToMain  : AuthEvent
    data object NavigateToAuth  : AuthEvent
    data class  ShowError(val message: String) : AuthEvent
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val api:             ApiClient,
    private val tokenRepository: TokenRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<AuthEvent>()
    val events: SharedFlow<AuthEvent> = _events.asSharedFlow()

    init {
        // Observar estado de autenticação do DataStore
        viewModelScope.launch {
            tokenRepository.isLoggedIn.collect { loggedIn ->
                _uiState.update { it.copy(isAuthenticated = loggedIn) }
                if (loggedIn) restoreSession()
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Register
    // ---------------------------------------------------------------------------

    fun register(
        email:       String,
        password:    String,
        username:    String,
        countryCode: String,
        language:    String,
    ) = viewModelScope.launch {
        _uiState.update { it.copy(isLoading = true, error = null) }

        try {
            val response: AuthResponse = api.post(
                "/auth/register",
                mapOf(
                    "email"       to email.trim().lowercase(),
                    "password"    to password,
                    "username"    to username.trim().lowercase(),
                    "countryCode" to countryCode,
                    "language"    to language,
                )
            )
            applyAuthResponse(response)
        } catch (e: ApiError) {
            _uiState.update { it.copy(isLoading = false, error = e.message) }
        } catch (e: Exception) {
            _uiState.update { it.copy(isLoading = false, error = "Erro inesperado. Tenta novamente.") }
        }
    }

    // ---------------------------------------------------------------------------
    // Login
    // ---------------------------------------------------------------------------

    fun login(email: String, password: String) = viewModelScope.launch {
        _uiState.update { it.copy(isLoading = true, error = null) }

        try {
            val response: AuthResponse = api.post(
                "/auth/login",
                mapOf("email" to email.trim().lowercase(), "password" to password)
            )
            applyAuthResponse(response)
        } catch (e: ApiError.Unauthorized) {
            _uiState.update { it.copy(isLoading = false, error = "Credenciais inválidas") }
        } catch (e: ApiError) {
            _uiState.update { it.copy(isLoading = false, error = e.message) }
        } catch (e: Exception) {
            _uiState.update { it.copy(isLoading = false, error = "Sem ligação à internet.") }
        }
    }

    // ---------------------------------------------------------------------------
    // Logout
    // ---------------------------------------------------------------------------

    fun logout() = viewModelScope.launch {
        try { api.post<Unit>("/auth/logout") } catch (_: Exception) { /* best-effort */ }
        tokenRepository.clear()
        _uiState.update { AuthUiState() }
        _events.emit(AuthEvent.NavigateToAuth)
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private suspend fun applyAuthResponse(response: AuthResponse) {
        tokenRepository.saveSession(
            accessToken = response.accessToken,
            userId      = response.user.id,
            username    = response.user.username,
        )
        _uiState.update {
            it.copy(
                isLoading       = false,
                isAuthenticated = true,
                currentUserId   = response.user.id,
                currentUsername = response.user.username,
                error           = null,
            )
        }
        _events.emit(AuthEvent.NavigateToMain)
    }

    private suspend fun restoreSession() {
        val userId   = tokenRepository.userId()   ?: return
        val username = tokenRepository.username() ?: return
        _uiState.update {
            it.copy(currentUserId = userId, currentUsername = username)
        }
    }
}
