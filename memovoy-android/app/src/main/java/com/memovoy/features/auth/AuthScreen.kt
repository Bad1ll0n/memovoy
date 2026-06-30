// com/memovoy/features/auth/AuthScreen.kt
package com.memovoy.features.auth

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.*
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.memovoy.shared.theme.MemoVoyBlue
import com.memovoy.shared.theme.MemoVoyGreen
import kotlinx.coroutines.flow.collectLatest

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------

@Composable
fun LandingScreen(
    onLogin:    () -> Unit,
    onRegister: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(MemoVoyBlue.copy(alpha = 0.85f), MemoVoyBlue)
                )
            )
    ) {
        Column(
            modifier              = Modifier.fillMaxSize().padding(horizontal = 28.dp),
            horizontalAlignment   = Alignment.CenterHorizontally,
            verticalArrangement   = Arrangement.SpaceBetween,
        ) {
            Spacer(Modifier.weight(1f))

            // Logo
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Icon(Icons.Default.Language, contentDescription = null,
                    tint = Color.White, modifier = Modifier.size(80.dp))
                Text("MemoVoy",
                    fontSize = 42.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
                Text("A tua rede social de viagens",
                    fontSize = 18.sp, color = Color.White.copy(alpha = 0.85f))
            }

            Spacer(Modifier.weight(1f))

            // CTAs
            Column(
                modifier            = Modifier.fillMaxWidth().padding(bottom = 48.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Button(
                    onClick  = onRegister,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                    colors   = ButtonDefaults.buttonColors(containerColor = Color.White),
                    shape    = MaterialTheme.shapes.large,
                ) {
                    Text("Começar — é grátis",
                        color = MemoVoyBlue, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }

                OutlinedButton(
                    onClick   = onLogin,
                    modifier  = Modifier.fillMaxWidth().height(54.dp),
                    shape     = MaterialTheme.shapes.large,
                    border    = BorderStroke(1.dp, Color.White.copy(alpha = 0.5f)),
                    colors    = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                ) {
                    Text("Já tenho conta", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

@Composable
fun LoginScreen(
    onBack:     () -> Unit,
    vm:         AuthViewModel = hiltViewModel(),
) {
    val uiState by vm.uiState.collectAsStateWithLifecycle()
    var email    by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPwd  by remember { mutableStateOf(false) }
    val passwordFocus = remember { FocusRequester() }
    val keyboard      = LocalSoftwareKeyboardController.current

    // Observar eventos de navegação
    LaunchedEffect(Unit) {
        vm.events.collectLatest { event ->
            if (event is AuthEvent.NavigateToMain) { /* NavController trata isto em MainActivity */ }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title       = { Text("Entrar") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Voltar")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier            = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Spacer(Modifier.height(24.dp))

            // Header
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Bem-vindo de volta",
                    style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("Inicia sessão para continuares a tua aventura",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            // Email
            MemoVoyTextField(
                value           = email,
                onValueChange   = { email = it },
                label           = "Email",
                placeholder     = "o.teu@email.com",
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction    = ImeAction.Next,
                    capitalization = KeyboardCapitalization.None,
                ),
                keyboardActions = KeyboardActions(onNext = { passwordFocus.requestFocus() }),
            )

            // Password
            MemoVoyTextField(
                value           = password,
                onValueChange   = { password = it },
                label           = "Password",
                modifier        = Modifier.focusRequester(passwordFocus),
                visualTransformation = if (showPwd) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon    = {
                    IconButton(onClick = { showPwd = !showPwd }) {
                        Icon(if (showPwd) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = null)
                    }
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction    = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = {
                    keyboard?.hide()
                    vm.login(email, password)
                }),
            )

            // Erro
            uiState.error?.let { error ->
                ErrorBanner(message = error)
            }

            // Botão
            MemoVoyButton(
                text      = "Entrar",
                isLoading = uiState.isLoading,
                enabled   = email.isNotBlank() && password.length >= 8,
                onClick   = { keyboard?.hide(); vm.login(email, password) },
            )

            Spacer(Modifier.height(16.dp))
        }
    }
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

@Composable
fun RegisterScreen(
    onBack: () -> Unit,
    vm:     AuthViewModel = hiltViewModel(),
) {
    val uiState  by vm.uiState.collectAsStateWithLifecycle()
    var email    by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var country  by remember { mutableStateOf("PT") }
    var showPwd  by remember { mutableStateOf(false) }
    var accepted by remember { mutableStateOf(false) }
    val keyboard = LocalSoftwareKeyboardController.current

    val usernameFocus = remember { FocusRequester() }
    val passwordFocus = remember { FocusRequester() }

    // Validação inline
    val usernameError = when {
        username.isEmpty()                        -> null
        username.length < 3                       -> "Mínimo 3 caracteres"
        username.length > 30                      -> "Máximo 30 caracteres"
        !username.matches(Regex("[a-z0-9_]+"))   -> "Apenas letras minúsculas, números e _"
        else                                      -> null
    }

    val passwordStrength = PasswordStrength.evaluate(password)

    val canSubmit = email.isNotBlank() && username.length >= 3 &&
        usernameError == null && passwordStrength.isAcceptable && accepted

    Scaffold(
        topBar = {
            TopAppBar(
                title          = { Text("Criar conta") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Voltar")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(Modifier.height(16.dp))

            Text("Junta-te à comunidade",
                style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)

            // Email
            MemoVoyTextField(
                value           = email,
                onValueChange   = { email = it },
                label           = "Email",
                placeholder     = "o.teu@email.com",
                keyboardOptions = KeyboardOptions(
                    keyboardType   = KeyboardType.Email,
                    imeAction      = ImeAction.Next,
                    capitalization = KeyboardCapitalization.None,
                ),
                keyboardActions = KeyboardActions(onNext = { usernameFocus.requestFocus() }),
            )

            // Username
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                MemoVoyTextField(
                    value           = username,
                    onValueChange   = { username = it.lowercase() },
                    label           = "Username",
                    placeholder     = "o_teu_username",
                    modifier        = Modifier.focusRequester(usernameFocus),
                    isError         = usernameError != null,
                    keyboardOptions = KeyboardOptions(
                        keyboardType   = KeyboardType.Text,
                        imeAction      = ImeAction.Next,
                        capitalization = KeyboardCapitalization.None,
                    ),
                    keyboardActions = KeyboardActions(onNext = { passwordFocus.requestFocus() }),
                )
                usernameError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall)
                }
            }

            // Password
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                MemoVoyTextField(
                    value                = password,
                    onValueChange        = { password = it },
                    label                = "Password",
                    modifier             = Modifier.focusRequester(passwordFocus),
                    visualTransformation = if (showPwd) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon         = {
                        IconButton(onClick = { showPwd = !showPwd }) {
                            Icon(if (showPwd) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = null)
                        }
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password, imeAction = ImeAction.Done
                    ),
                )
                if (password.isNotEmpty()) {
                    PasswordStrengthBar(strength = passwordStrength)
                }
            }

            // País
            CountryPicker(selected = country, onSelect = { country = it })

            // Termos
            Row(
                verticalAlignment   = Alignment.CenterVertically,
                modifier            = Modifier.fillMaxWidth(),
            ) {
                Checkbox(checked = accepted, onCheckedChange = { accepted = it })
                Spacer(Modifier.width(8.dp))
                Text("Aceito os Termos de Serviço e a Política de Privacidade",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            uiState.error?.let { ErrorBanner(it) }

            MemoVoyButton(
                text      = "Criar conta",
                isLoading = uiState.isLoading,
                enabled   = canSubmit,
                onClick   = {
                    keyboard?.hide()
                    vm.register(email, password, username, country, "pt")
                },
            )

            Spacer(Modifier.height(24.dp))
        }
    }
}

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------

enum class PasswordStrength(val label: String, val color: Color, val isAcceptable: Boolean) {
    VERY_WEAK("Muito fraca",  Color(0xFFE53935), false),
    WEAK     ("Fraca",        Color(0xFFFF6F00), false),
    FAIR     ("Razoável",     Color(0xFFFDD835), true),
    GOOD     ("Boa",          Color(0xFF43A047), true),
    STRONG   ("Excelente",    Color(0xFF1B5E20), true);

    companion object {
        fun evaluate(password: String): PasswordStrength {
            var score = 0
            if (password.length >= 8)                              score++
            if (password.length >= 12)                             score++
            if (password.any { it.isUpperCase() })                 score++
            if (password.any { it.isDigit() })                     score++
            return entries[score.coerceIn(0, entries.size - 1)]
        }
    }
}

@Composable
fun PasswordStrengthBar(strength: PasswordStrength) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier            = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            PasswordStrength.entries.forEachIndexed { i, _ ->
                val filled = i <= PasswordStrength.entries.indexOf(strength)
                Box(
                    modifier = Modifier
                        .weight(1f).height(5.dp)
                        .background(
                            color = if (filled) strength.color else Color.LightGray,
                            shape = MaterialTheme.shapes.small,
                        )
                )
            }
        }
        Text(strength.label, color = strength.color, style = MaterialTheme.typography.labelSmall)
    }
}

// ---------------------------------------------------------------------------
// Shared composables
// ---------------------------------------------------------------------------

@Composable
fun MemoVoyTextField(
    value:                String,
    onValueChange:        (String) -> Unit,
    label:                String,
    modifier:             Modifier              = Modifier,
    placeholder:          String                = "",
    isError:              Boolean               = false,
    visualTransformation: VisualTransformation  = VisualTransformation.None,
    trailingIcon:         @Composable (() -> Unit)? = null,
    keyboardOptions:      KeyboardOptions       = KeyboardOptions.Default,
    keyboardActions:      KeyboardActions       = KeyboardActions.Default,
) {
    OutlinedTextField(
        value                = value,
        onValueChange        = onValueChange,
        label                = { Text(label) },
        placeholder          = { Text(placeholder, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)) },
        modifier             = modifier.fillMaxWidth(),
        isError              = isError,
        visualTransformation = visualTransformation,
        trailingIcon         = trailingIcon,
        keyboardOptions      = keyboardOptions,
        keyboardActions      = keyboardActions,
        singleLine           = true,
        shape                = MaterialTheme.shapes.medium,
    )
}

@Composable
fun MemoVoyButton(
    text:      String,
    onClick:   () -> Unit,
    modifier:  Modifier = Modifier,
    isLoading: Boolean  = false,
    enabled:   Boolean  = true,
) {
    Button(
        onClick  = onClick,
        modifier = modifier.fillMaxWidth().height(54.dp),
        enabled  = enabled && !isLoading,
        shape    = MaterialTheme.shapes.large,
        colors   = ButtonDefaults.buttonColors(containerColor = MemoVoyBlue),
    ) {
        if (isLoading) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp),
                color = Color.White, strokeWidth = 2.dp)
        } else {
            Text(text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
    }
}

@Composable
fun ErrorBanner(message: String) {
    Row(
        modifier            = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.errorContainer, MaterialTheme.shapes.medium)
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment   = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.Error, contentDescription = null,
            tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
        Text(message, color = MaterialTheme.colorScheme.onErrorContainer,
            style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun CountryPicker(selected: String, onSelect: (String) -> Unit) {
    val countries = listOf(
        "PT" to "🇵🇹 Portugal", "BR" to "🇧🇷 Brasil",
        "ES" to "🇪🇸 Espanha",  "FR" to "🇫🇷 França",
        "DE" to "🇩🇪 Alemanha", "GB" to "🇬🇧 Reino Unido",
        "US" to "🇺🇸 EUA",      "JP" to "🇯🇵 Japão",
    )
    var expanded by remember { mutableStateOf(false) }
    val current  = countries.find { it.first == selected }?.second ?: selected

    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value            = current,
            onValueChange    = {},
            readOnly         = true,
            label            = { Text("País") },
            trailingIcon     = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier         = Modifier.fillMaxWidth().menuAnchor(),
            shape            = MaterialTheme.shapes.medium,
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            countries.forEach { (code, label) ->
                DropdownMenuItem(
                    text    = { Text(label) },
                    onClick = { onSelect(code); expanded = false },
                    leadingIcon = if (code == selected) {
                        { Icon(Icons.Default.Check, contentDescription = null, tint = MemoVoyBlue) }
                    } else null
                )
            }
        }
    }
}
