// com/memovoy/features/wizard/WizardScreen.kt
package com.memovoy.features.wizard

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.text.font.*
import androidx.compose.ui.text.input.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.memovoy.core.models.Itinerary
import com.memovoy.core.network.ApiClient
import com.memovoy.features.auth.MemoVoyButton
import com.memovoy.features.auth.MemoVoyTextField
import com.memovoy.shared.theme.MemoVoyBlue
import com.memovoy.shared.theme.MemoVoyGreen
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

// ---------------------------------------------------------------------------
// WizardState
// ---------------------------------------------------------------------------

data class WizardState(
    val destinationName:     String         = "",
    val countryCode:         String         = "PT",
    val startDate:           LocalDate      = LocalDate.now().plusWeeks(1),
    val endDate:             LocalDate      = LocalDate.now().plusWeeks(2),
    val groupType:           String         = "solo",
    val groupSize:           Int            = 1,
    val transportModes:      List<String>   = listOf("public"),
    val pacePreference:      String         = "moderate",
    val accommodationType:   String?        = null,
    val budgetPerDay:        Int?           = null,
    val travelStyles:        List<String>   = emptyList(),
    val mustSeeAttractions:  List<String>   = emptyList(),
    val avoidCategories:     List<String>   = emptyList(),
    val dietaryRestrictions: List<String>   = emptyList(),
    val visibility:          String         = "public",
    val language:            String         = "pt-PT",
) {
    val isStep1Valid get() = destinationName.isNotBlank() && countryCode.length == 2
    val isStep2Valid get() = !endDate.isBefore(startDate)
    val isStep3Valid get() = transportModes.isNotEmpty()
    val durationDays get() = java.time.temporal.ChronoUnit.DAYS.between(startDate, endDate).toInt() + 1

    fun toApiBody(): Map<String, Any?> {
        val fmt = DateTimeFormatter.ISO_LOCAL_DATE
        return mapOf(
            "destination"          to mapOf("name" to destinationName, "countryCode" to countryCode),
            "startDate"            to fmt.format(startDate),
            "endDate"              to fmt.format(endDate),
            "groupType"            to groupType,
            "groupSize"            to groupSize,
            "transportModes"       to transportModes,
            "pacePreference"       to pacePreference,
            "accommodationType"    to accommodationType,
            "budgetPerDay"         to budgetPerDay,
            "travelStyles"         to travelStyles,
            "mustSeeAttractions"   to mustSeeAttractions,
            "avoidCategories"      to avoidCategories,
            "dietaryRestrictions"  to dietaryRestrictions,
            "visibility"           to visibility,
            "language"             to language,
        )
    }
}

// ---------------------------------------------------------------------------
// UiState
// ---------------------------------------------------------------------------

data class WizardUiState(
    val state:               WizardState   = WizardState(),
    val currentStep:         Int           = 1,
    val isGenerating:        Boolean       = false,
    val error:               String?       = null,
    val generatedItinerary:  Itinerary?    = null,
    val usedFallback:        Boolean       = false,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class WizardViewModel @Inject constructor(
    private val api: ApiClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(WizardUiState())
    val uiState: StateFlow<WizardUiState> = _uiState.asStateFlow()

    val totalSteps = 6

    fun update(transform: WizardState.() -> WizardState) {
        _uiState.update { it.copy(state = it.state.transform()) }
    }

    fun next() {
        val state = _uiState.value
        if (!canGoNext(state)) return
        if (state.currentStep < totalSteps) {
            _uiState.update { it.copy(currentStep = it.currentStep + 1) }
        }
    }

    fun back() {
        val step = _uiState.value.currentStep
        if (step > 1) _uiState.update { it.copy(currentStep = it.currentStep - 1) }
    }

    fun canGoNext(state: WizardUiState = _uiState.value): Boolean = when (state.currentStep) {
        1    -> state.state.isStep1Valid
        2    -> state.state.isStep2Valid
        3    -> state.state.isStep3Valid
        else -> true
    }

    fun generate() {
        viewModelScope.launch {
            _uiState.update { it.copy(isGenerating = true, error = null) }
            try {
                data class Meta(val usedFallback: Boolean, val showFallbackWarning: Boolean)
                data class Resp(val itinerary: Itinerary, val meta: Meta)
                val r: Resp = api.post("/ai/generate", _uiState.value.state.toApiBody())
                _uiState.update {
                    it.copy(
                        isGenerating       = false,
                        generatedItinerary = r.itinerary,
                        usedFallback       = r.meta.usedFallback,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isGenerating = false, error = e.message ?: "Erro na geração") }
            }
        }
    }

    fun reset() { _uiState.value = WizardUiState() }
}

// ---------------------------------------------------------------------------
// WizardScreen
// ---------------------------------------------------------------------------

@Composable
fun WizardScreen(
    onDismiss:           () -> Unit,
    onItineraryCreated:  (String) -> Unit = {},
    vm:                  WizardViewModel = hiltViewModel(),
) {
    val uiState by vm.uiState.collectAsStateWithLifecycle()

    if (uiState.generatedItinerary != null) {
        WizardSuccessScreen(
            itinerary    = uiState.generatedItinerary!!,
            usedFallback = uiState.usedFallback,
            onView       = { onItineraryCreated(uiState.generatedItinerary!!.id) },
            onDismiss    = { vm.reset(); onDismiss() },
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Criar roteiro com IA", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("Passo ${uiState.currentStep} de ${vm.totalSteps}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Fechar")
                    }
                }
            )
        },
        bottomBar = {
            WizardNavBar(
                currentStep  = uiState.currentStep,
                totalSteps   = vm.totalSteps,
                canGoNext    = vm.canGoNext(),
                isGenerating = uiState.isGenerating,
                onBack       = { vm.back() },
                onNext       = { if (uiState.currentStep == vm.totalSteps) vm.generate() else vm.next() },
                onCancel     = onDismiss,
            )
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            // Barra de progresso
            LinearProgressIndicator(
                progress      = { uiState.currentStep.toFloat() / vm.totalSteps },
                modifier      = Modifier.fillMaxWidth().height(4.dp),
                color         = MemoVoyBlue,
            )

            // Conteúdo da etapa com animação slide
            AnimatedContent(
                targetState   = uiState.currentStep,
                transitionSpec = {
                    val forward = targetState > initialState
                    (slideInHorizontally { if (forward) it else -it } + fadeIn()) togetherWith
                    (slideOutHorizontally { if (forward) -it else it } + fadeOut())
                },
                label         = "wizard_step",
            ) { step ->
                Box(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                    when (step) {
                        1 -> WizardStep1(state = uiState.state, onUpdate = { vm.update { it } })
                        2 -> WizardStep2(state = uiState.state, onUpdate = { vm.update { it } })
                        3 -> WizardStep3(state = uiState.state, onUpdate = { vm.update { it } })
                        4 -> WizardStep4(state = uiState.state, onUpdate = { vm.update { it } })
                        5 -> WizardStep5(state = uiState.state, onUpdate = { vm.update { it } })
                        6 -> WizardStep6(state = uiState.state, onUpdate = { vm.update { it } }, error = uiState.error)
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Nav bar do wizard
// ---------------------------------------------------------------------------

@Composable
fun WizardNavBar(
    currentStep:  Int,
    totalSteps:   Int,
    canGoNext:    Boolean,
    isGenerating: Boolean,
    onBack:       () -> Unit,
    onNext:       () -> Unit,
    onCancel:     () -> Unit,
) {
    Surface(shadowElevation = 8.dp) {
        Row(
            modifier = Modifier.fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (currentStep > 1) {
                OutlinedButton(
                    onClick  = onBack,
                    modifier = Modifier.weight(1f),
                ) { Text("Anterior") }
            } else {
                OutlinedButton(
                    onClick  = onCancel,
                    modifier = Modifier.weight(1f),
                ) { Text("Cancelar") }
            }

            Button(
                onClick  = onNext,
                modifier = Modifier.weight(1.5f),
                enabled  = canGoNext && !isGenerating,
                colors   = ButtonDefaults.buttonColors(containerColor = MemoVoyBlue),
            ) {
                if (isGenerating) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment     = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp),
                            color = androidx.compose.ui.graphics.Color.White, strokeWidth = 2.dp)
                        Text("A gerar…")
                    }
                } else if (currentStep == totalSteps) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment     = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text("Gerar com IA", fontWeight = FontWeight.Bold)
                    }
                } else {
                    Text("Próximo", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------

@Composable
fun WizardStep1(state: WizardState, onUpdate: (WizardState.() -> WizardState) -> Unit) {
    val popularCountries = listOf(
        "PT" to "🇵🇹 Portugal", "BR" to "🇧🇷 Brasil",  "JP" to "🇯🇵 Japão",
        "IT" to "🇮🇹 Itália",   "FR" to "🇫🇷 França",   "ES" to "🇪🇸 Espanha",
        "TH" to "🇹🇭 Tailândia","US" to "🇺🇸 EUA",     "GR" to "🇬🇷 Grécia",
        "MX" to "🇲🇽 México",
    )

    WizardStepScaffold(icon = Icons.Default.LocationOn, title = "Para onde vais?", subtitle = "Escolhe o teu destino.") {
        MemoVoyTextField(
            value         = state.destinationName,
            onValueChange = { v -> onUpdate { copy(destinationName = v) } },
            label         = "Cidade ou região",
            placeholder   = "Ex: Tokyo, Bali, Lisboa…",
        )
        Spacer(Modifier.height(16.dp))
        Text("Destinos populares", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        LazyVerticalGrid(
            columns             = GridCells.Fixed(2),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier            = Modifier.height(240.dp), // fixo para não conflituar com outer scroll
        ) {
            items(popularCountries) { (code, label) ->
                val isSelected = state.countryCode == code
                OutlinedButton(
                    onClick  = { onUpdate { copy(countryCode = code, destinationName = if (destinationName.isEmpty()) label.substringAfter(' ') else destinationName) } },
                    modifier = Modifier.fillMaxWidth(),
                    colors   = ButtonDefaults.outlinedButtonColors(
                        containerColor = if (isSelected) MemoVoyBlue.copy(alpha = 0.1f) else androidx.compose.ui.graphics.Color.Transparent,
                        contentColor   = if (isSelected) MemoVoyBlue else MaterialTheme.colorScheme.onSurface,
                    ),
                    border   = androidx.compose.foundation.BorderStroke(
                        1.dp,
                        if (isSelected) MemoVoyBlue else MaterialTheme.colorScheme.outline,
                    ),
                ) { Text(label, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
fun WizardStep2(state: WizardState, onUpdate: (WizardState.() -> WizardState) -> Unit) {
    val fmt = DateTimeFormatter.ofPattern("dd MMM yyyy", java.util.Locale("pt", "PT"))

    WizardStepScaffold(icon = Icons.Default.CalendarMonth, title = "Quando viajas?", subtitle = "Datas de partida e regresso.") {
        // DatePicker simplificado — em produção usar DatePickerDialog do Material 3
        OutlinedCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Column {
                        Text("Partida", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(fmt.format(state.startDate), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    }
                    Icon(Icons.Default.ArrowForward, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Regresso", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(fmt.format(state.endDate), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        // Ajuste de dias com +/-
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Duração:", style = MaterialTheme.typography.bodyMedium)
            IconButton(onClick = { if (state.durationDays > 1) onUpdate { copy(endDate = endDate.minusDays(1)) } }) {
                Icon(Icons.Default.Remove, contentDescription = null)
            }
            Surface(color = MemoVoyBlue.copy(alpha = 0.1f), shape = MaterialTheme.shapes.medium) {
                Text("${state.durationDays} dias",
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = MemoVoyBlue)
            }
            IconButton(onClick = { if (state.durationDays < 21) onUpdate { copy(endDate = endDate.plusDays(1)) } }) {
                Icon(Icons.Default.Add, contentDescription = null)
            }
        }
        if (state.durationDays > 21) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Warning, contentDescription = null,
                    modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.tertiary)
                Text("Máximo 21 dias com IA.", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.tertiary)
            }
        }
    }
}

@Composable
fun WizardStep3(state: WizardState, onUpdate: (WizardState.() -> WizardState) -> Unit) {
    val groups    = listOf("solo" to "Solo 🧳", "couple" to "Casal 💑", "friends" to "Amigos 👫", "family" to "Família 👨‍👩‍👧")
    val transports = listOf("walking" to "🚶 A pé", "public" to "🚌 Público", "car" to "🚗 Carro",
                            "bicycle" to "🚲 Bicicleta", "taxi" to "🚕 Táxi", "tour" to "🗺 Tour")

    WizardStepScaffold(icon = Icons.Default.Group, title = "Com quem viajas?", subtitle = "Grupo e transportes.") {
        Text("Tipo de grupo", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        LazyVerticalGrid(GridCells.Fixed(2), horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.height(104.dp)) {
            items(groups) { (type, label) ->
                val sel = state.groupType == type
                OutlinedButton(
                    onClick  = { onUpdate { copy(groupType = type, groupSize = if (type == "solo") 1 else groupSize) } },
                    modifier = Modifier.fillMaxWidth(),
                    colors   = ButtonDefaults.outlinedButtonColors(containerColor = if (sel) MemoVoyBlue.copy(0.1f) else androidx.compose.ui.graphics.Color.Transparent),
                    border   = androidx.compose.foundation.BorderStroke(1.dp, if (sel) MemoVoyBlue else MaterialTheme.colorScheme.outline),
                ) { Text(label, style = MaterialTheme.typography.bodySmall) }
            }
        }

        if (state.groupType != "solo") {
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Pessoas:", style = MaterialTheme.typography.bodyMedium)
                IconButton(onClick = { if (state.groupSize > 2) onUpdate { copy(groupSize = groupSize - 1) } }) {
                    Icon(Icons.Default.Remove, contentDescription = null)
                }
                Text("${state.groupSize}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                IconButton(onClick = { if (state.groupSize < 20) onUpdate { copy(groupSize = groupSize + 1) } }) {
                    Icon(Icons.Default.Add, contentDescription = null)
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("Transportes (selecciona todos)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        LazyVerticalGrid(GridCells.Fixed(2), horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.height(156.dp)) {
            items(transports) { (mode, label) ->
                val sel = state.transportModes.contains(mode)
                OutlinedButton(
                    onClick  = {
                        onUpdate {
                            val modes = if (sel) transportModes - mode else transportModes + mode
                            copy(transportModes = modes.ifEmpty { listOf(mode) })
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors   = ButtonDefaults.outlinedButtonColors(containerColor = if (sel) MemoVoyBlue.copy(0.1f) else androidx.compose.ui.graphics.Color.Transparent),
                    border   = androidx.compose.foundation.BorderStroke(1.dp, if (sel) MemoVoyBlue else MaterialTheme.colorScheme.outline),
                ) { Text(label, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
fun WizardStep4(state: WizardState, onUpdate: (WizardState.() -> WizardState) -> Unit) {
    val paces  = listOf("relaxed" to "🐢 Relaxado", "moderate" to "🚶 Moderado", "intensive" to "🐇 Intensivo")
    val accoms = listOf("hotel" to "🏨 Hotel", "airbnb" to "🏠 Airbnb", "hostel" to "🛏 Hostel", "boutique" to "✨ Boutique")
    var budgetText by remember { mutableStateOf(state.budgetPerDay?.let { (it / 100).toString() } ?: "") }

    WizardStepScaffold(icon = Icons.Default.Tune, title = "Ritmo e conforto", subtitle = "Como preferes organizar o dia?") {
        Text("Ritmo da viagem", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            paces.forEach { (p, label) ->
                val sel = state.pacePreference == p
                OutlinedButton(
                    onClick  = { onUpdate { copy(pacePreference = p) } },
                    modifier = Modifier.weight(1f),
                    colors   = ButtonDefaults.outlinedButtonColors(containerColor = if (sel) MemoVoyBlue.copy(0.1f) else androidx.compose.ui.graphics.Color.Transparent),
                    border   = androidx.compose.foundation.BorderStroke(1.dp, if (sel) MemoVoyBlue else MaterialTheme.colorScheme.outline),
                ) { Text(label, style = MaterialTheme.typography.labelSmall) }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("Alojamento (opcional)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        LazyVerticalGrid(GridCells.Fixed(2), horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.height(104.dp)) {
            items(accoms) { (type, label) ->
                val sel = state.accommodationType == type
                OutlinedButton(
                    onClick  = { onUpdate { copy(accommodationType = if (sel) null else type) } },
                    modifier = Modifier.fillMaxWidth(),
                    colors   = ButtonDefaults.outlinedButtonColors(containerColor = if (sel) MemoVoyBlue.copy(0.1f) else androidx.compose.ui.graphics.Color.Transparent),
                    border   = androidx.compose.foundation.BorderStroke(1.dp, if (sel) MemoVoyBlue else MaterialTheme.colorScheme.outline),
                ) { Text(label, style = MaterialTheme.typography.bodySmall) }
            }
        }

        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value         = budgetText,
            onValueChange = { v ->
                budgetText = v.filter { it.isDigit() }
                onUpdate { copy(budgetPerDay = budgetText.toIntOrNull()?.let { it * 100 }) }
            },
            label         = { Text("Orçamento por dia (€)") },
            modifier      = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine    = true,
            shape         = MaterialTheme.shapes.medium,
        )
    }
}

@Composable
fun WizardStep5(state: WizardState, onUpdate: (WizardState.() -> WizardState) -> Unit) {
    val styles   = listOf("cultura","gastronomia","aventura","natureza","praias","museus","compras","nightlife")
    var newAttr  by remember { mutableStateOf("") }

    WizardStepScaffold(icon = Icons.Default.Favorite, title = "O que adoras?", subtitle = "Personaliza o teu roteiro.") {
        Text("Estilo de viagem", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        LazyVerticalGrid(GridCells.Fixed(2), horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.height(208.dp)) {
            items(styles) { style ->
                val sel = state.travelStyles.contains(style)
                OutlinedButton(
                    onClick  = {
                        onUpdate { copy(travelStyles = if (sel) travelStyles - style else travelStyles + style) }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors   = ButtonDefaults.outlinedButtonColors(containerColor = if (sel) MemoVoyBlue.copy(0.1f) else androidx.compose.ui.graphics.Color.Transparent),
                    border   = androidx.compose.foundation.BorderStroke(1.dp, if (sel) MemoVoyBlue else MaterialTheme.colorScheme.outline),
                ) { Text(style.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodySmall) }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("Obrigatório visitar (máx. 5)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value         = newAttr,
                onValueChange = { newAttr = it },
                label         = { Text("Ex: Torre Eiffel") },
                modifier      = Modifier.weight(1f),
                singleLine    = true,
                shape         = MaterialTheme.shapes.medium,
            )
            IconButton(
                onClick  = {
                    val a = newAttr.trim()
                    if (a.isNotEmpty() && state.mustSeeAttractions.size < 5) {
                        onUpdate { copy(mustSeeAttractions = mustSeeAttractions + a) }
                        newAttr = ""
                    }
                },
                enabled  = newAttr.isNotBlank() && state.mustSeeAttractions.size < 5,
            ) { Icon(Icons.Default.Add, contentDescription = "Adicionar") }
        }
        state.mustSeeAttractions.forEach { attr ->
            Row(
                modifier = Modifier.fillMaxWidth()
                    .background(MemoVoyBlue.copy(0.06f), MaterialTheme.shapes.medium)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(attr, style = MaterialTheme.typography.bodySmall)
                IconButton(
                    onClick  = { onUpdate { copy(mustSeeAttractions = mustSeeAttractions - attr) } },
                    modifier = Modifier.size(24.dp),
                ) { Icon(Icons.Default.Close, contentDescription = "Remover", modifier = Modifier.size(16.dp)) }
            }
        }
    }
}

@Composable
fun WizardStep6(state: WizardState, onUpdate: (WizardState.() -> WizardState) -> Unit, error: String?) {
    val fmt = DateTimeFormatter.ofPattern("d MMM", java.util.Locale("pt", "PT"))

    WizardStepScaffold(icon = Icons.Default.CheckCircle, title = "Tudo pronto!", subtitle = "Revê e escolhe a visibilidade.") {
        // Resumo
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SummaryRow(Icons.Default.LocationOn, "Destino", "${state.destinationName} (${state.countryCode})")
                SummaryRow(Icons.Default.CalendarMonth, "Datas", "${fmt.format(state.startDate)} → ${fmt.format(state.endDate)} · ${state.durationDays}d")
                SummaryRow(Icons.Default.Group, "Grupo", "${state.groupType.replaceFirstChar { it.uppercase() }} · ${state.groupSize} pessoa(s)")
                SummaryRow(Icons.Default.Tune, "Ritmo", state.pacePreference.replaceFirstChar { it.uppercase() })
                if (state.travelStyles.isNotEmpty())
                    SummaryRow(Icons.Default.Favorite, "Estilos", state.travelStyles.joinToString(", "))
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("Visibilidade", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            listOf("public" to "Público", "followers" to "Seguidores", "private" to "Privado")
                .forEachIndexed { i, (value, label) ->
                    SegmentedButton(
                        selected = state.visibility == value,
                        onClick  = { onUpdate { copy(visibility = value) } },
                        shape    = SegmentedButtonDefaults.itemShape(index = i, count = 3),
                    ) { Text(label, style = MaterialTheme.typography.labelSmall) }
                }
        }

        error?.let {
            Spacer(Modifier.height(12.dp))
            Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.medium) {
                Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Error, contentDescription = null, tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(18.dp))
                    Text(it, color = MaterialTheme.colorScheme.onErrorContainer,
                        style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        Spacer(Modifier.height(12.dp))
        Surface(color = MemoVoyBlue.copy(alpha = 0.08f), shape = MaterialTheme.shapes.medium) {
            Text(
                "A IA vai criar um roteiro detalhado com base nas tuas preferências. Podes editar tudo depois.",
                modifier = Modifier.padding(12.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Wizard success
// ---------------------------------------------------------------------------

@Composable
fun WizardSuccessScreen(
    itinerary:    Itinerary,
    usedFallback: Boolean,
    onView:       () -> Unit,
    onDismiss:    () -> Unit,
) {
    Scaffold { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(Icons.Default.CheckCircle, contentDescription = null,
                modifier = Modifier.size(84.dp), tint = MemoVoyGreen)
            Spacer(Modifier.height(20.dp))
            Text("Roteiro criado!",
                style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(itinerary.title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center)

            if (usedFallback) {
                Spacer(Modifier.height(12.dp))
                Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = MaterialTheme.shapes.medium) {
                    Row(modifier = Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Info, contentDescription = null,
                            modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.tertiary)
                        Text("Gerado a partir de uma viagem semelhante. Verifica as datas.",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onTertiaryContainer)
                    }
                }
            }

            Spacer(Modifier.height(40.dp))
            MemoVoyButton(text = "Ver roteiro", onClick = onView)
            Spacer(Modifier.height(12.dp))
            TextButton(onClick = onDismiss) { Text("Fechar") }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers partilhados
// ---------------------------------------------------------------------------

@Composable
fun WizardStepScaffold(
    icon:     androidx.compose.ui.graphics.vector.ImageVector,
    title:    String,
    subtitle: String,
    content:  @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        Icon(icon, contentDescription = null, tint = MemoVoyBlue, modifier = Modifier.size(36.dp))
        Spacer(Modifier.height(10.dp))
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))
        content()
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
fun SummaryRow(
    icon:  androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment     = Alignment.Top,
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp),
            tint = MemoVoyBlue)
        Text(label, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(72.dp))
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
    }
}
