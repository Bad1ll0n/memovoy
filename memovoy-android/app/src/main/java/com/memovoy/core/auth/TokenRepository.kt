// com/memovoy/core/auth/TokenRepository.kt
package com.memovoy.core.auth

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

// Extension para DataStore encriptado
private val Context.tokenDataStore: DataStore<Preferences>
    by preferencesDataStore(name = "memovoy_secure_tokens")

@Singleton
class TokenRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val dataStore = context.tokenDataStore

    private object Keys {
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val USER_ID      = stringPreferencesKey("user_id")
        val USERNAME     = stringPreferencesKey("username")
    }

    // ---------------------------------------------------------------------------
    // Leitura
    // ---------------------------------------------------------------------------

    // Suspend para leitura one-shot (não observar mudanças)
    suspend fun accessToken(): String? =
        dataStore.data.firstOrNull()?.get(Keys.ACCESS_TOKEN)

    suspend fun userId(): String? =
        dataStore.data.firstOrNull()?.get(Keys.USER_ID)

    suspend fun username(): String? =
        dataStore.data.firstOrNull()?.get(Keys.USERNAME)

    // Flow para observar estado de autenticação reactivamente
    val isLoggedIn: Flow<Boolean> =
        dataStore.data.map { prefs -> prefs[Keys.ACCESS_TOKEN] != null }

    // ---------------------------------------------------------------------------
    // Escrita
    // ---------------------------------------------------------------------------

    suspend fun saveAccessToken(token: String) {
        dataStore.edit { it[Keys.ACCESS_TOKEN] = token }
    }

    suspend fun saveSession(accessToken: String, userId: String, username: String) {
        dataStore.edit { prefs ->
            prefs[Keys.ACCESS_TOKEN] = accessToken
            prefs[Keys.USER_ID]      = userId
            prefs[Keys.USERNAME]     = username
        }
    }

    suspend fun clear() {
        dataStore.edit { it.clear() }
    }
}
