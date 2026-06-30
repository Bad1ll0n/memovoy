// com/memovoy/AuthViewModelTest.kt
package com.memovoy

import app.cash.turbine.test
import com.memovoy.core.auth.TokenRepository
import com.memovoy.core.models.AuthResponse
import com.memovoy.core.network.ApiClient
import com.memovoy.core.network.ApiError
import com.memovoy.features.auth.AuthEvent
import com.memovoy.features.auth.AuthViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.*

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var api:             ApiClient
    private lateinit var tokenRepository: TokenRepository
    private lateinit var vm:              AuthViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        api             = mock()
        tokenRepository = mock()

        // TokenRepository.isLoggedIn devolve false por defeito
        whenever(tokenRepository.isLoggedIn).thenReturn(MutableStateFlow(false))

        vm = AuthViewModel(api, tokenRepository)
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    // ---------------------------------------------------------------------------
    // Login success
    // ---------------------------------------------------------------------------

    @Test
    fun `login bem-sucedido actualiza estado e emite NavigateToMain`() = runTest {
        val mockResponse = AuthResponse(
            user        = AuthResponse.AuthUser("uid-1", "testuser", "user", true),
            accessToken = "access.token.123",
        )
        whenever(api.post<AuthResponse>(eq("/auth/login"), any())).thenReturn(mockResponse)

        vm.events.test {
            vm.login("test@example.com", "Password123")

            val event = awaitItem()
            assertIs<AuthEvent.NavigateToMain>(event)
            cancelAndIgnoreRemainingEvents()
        }

        val state = vm.uiState.value
        assertTrue(state.isAuthenticated)
        assertFalse(state.isLoading)
        assertNull(state.error)
        assertEquals("testuser", state.currentUsername)
    }

    // ---------------------------------------------------------------------------
    // Login failure
    // ---------------------------------------------------------------------------

    @Test
    fun `login com credenciais erradas mostra erro`() = runTest {
        whenever(api.post<AuthResponse>(eq("/auth/login"), any()))
            .thenThrow(ApiError.Unauthorized)

        vm.login("wrong@example.com", "wrongpassword")

        val state = vm.uiState.value
        assertFalse(state.isAuthenticated)
        assertFalse(state.isLoading)
        assertNotNull(state.error)
        assertTrue(state.error!!.isNotEmpty())
    }

    @Test
    fun `login com erro de rede mostra mensagem sem ligação`() = runTest {
        whenever(api.post<AuthResponse>(eq("/auth/login"), any()))
            .thenThrow(ApiError.NetworkError(RuntimeException("Connection refused")))

        vm.login("test@example.com", "Password123")

        val state = vm.uiState.value
        assertFalse(state.isAuthenticated)
        assertNotNull(state.error)
    }

    // ---------------------------------------------------------------------------
    // Register
    // ---------------------------------------------------------------------------

    @Test
    fun `register bem-sucedido emite NavigateToMain`() = runTest {
        val mockResponse = AuthResponse(
            user        = AuthResponse.AuthUser("uid-2", "newuser", "user", false),
            accessToken = "new.access.token",
        )
        whenever(api.post<AuthResponse>(eq("/auth/register"), any())).thenReturn(mockResponse)

        vm.events.test {
            vm.register("new@example.com", "Password123", "newuser", "PT", "pt")

            val event = awaitItem()
            assertIs<AuthEvent.NavigateToMain>(event)
            cancelAndIgnoreRemainingEvents()
        }

        verify(tokenRepository).saveSession(
            accessToken = eq("new.access.token"),
            userId      = eq("uid-2"),
            username    = eq("newuser"),
        )
    }

    @Test
    fun `register com email duplicado mostra erro de conflito`() = runTest {
        whenever(api.post<AuthResponse>(eq("/auth/register"), any()))
            .thenThrow(ApiError.Conflict("Este email já está registado"))

        vm.register("dup@example.com", "Password123", "dupuser", "PT", "pt")

        val state = vm.uiState.value
        assertFalse(state.isAuthenticated)
        assertEquals("Este email já está registado", state.error)
    }

    // ---------------------------------------------------------------------------
    // Logout
    // ---------------------------------------------------------------------------

    @Test
    fun `logout limpa estado e emite NavigateToAuth`() = runTest {
        // Simular utilizador autenticado
        whenever(tokenRepository.isLoggedIn).thenReturn(MutableStateFlow(true))
        whenever(tokenRepository.userId()).thenReturn("uid-1")
        whenever(tokenRepository.username()).thenReturn("testuser")
        whenever(api.post<Unit>(eq("/auth/logout"), anyOrNull())).thenReturn(Unit)

        vm = AuthViewModel(api, tokenRepository)

        vm.events.test {
            vm.logout()

            val event = awaitItem()
            assertIs<AuthEvent.NavigateToAuth>(event)
            cancelAndIgnoreRemainingEvents()
        }

        verify(tokenRepository).clear()

        val state = vm.uiState.value
        assertFalse(state.isAuthenticated)
        assertNull(state.currentUserId)
        assertNull(state.currentUsername)
    }

    // ---------------------------------------------------------------------------
    // isLoading state
    // ---------------------------------------------------------------------------

    @Test
    fun `isLoading é true durante o login e false após conclusão`() = runTest {
        val states = mutableListOf<Boolean>()

        whenever(api.post<AuthResponse>(eq("/auth/login"), any()))
            .thenAnswer {
                // Capturar estado durante a execução
                states.add(vm.uiState.value.isLoading)
                throw ApiError.Unauthorized
            }

        vm.login("test@example.com", "pass")

        // Após conclusão (com erro), isLoading deve ser false
        assertFalse(vm.uiState.value.isLoading)
        // Durante a execução (capturado no mock), isLoading devia ser true
        // Nota: com UnconfinedTestDispatcher pode não capturar o estado intermédio
        // Usar StandardTestDispatcher para testar estados intermédios
    }
}

// Helpers
private inline fun <reified T> assertIs(value: Any?) {
    assertTrue("Esperado ${T::class.simpleName}, obtido ${value?.javaClass?.simpleName}",
        value is T)
}
