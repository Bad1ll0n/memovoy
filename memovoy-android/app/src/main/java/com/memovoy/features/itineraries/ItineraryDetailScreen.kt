// com/memovoy/features/itineraries/ItineraryDetailScreen.kt
package com.memovoy.features.itineraries

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.memovoy.core.models.*
import com.memovoy.core.network.ApiClient
import com.memovoy.shared.theme.MemoVoyBlue
import com.memovoy.shared.theme.MemoVoyGreen
import com.memovoy.shared.ui.EmptyState
import com.memovoy.shared.ui.ShimmerBox
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

// ── ViewModel ──────────────────────────────────────────────────────────────

data class ItineraryDetailUiState(
    val itinerary:   Itinerary? = null,
    val isLoading:   Boolean    = false,
    val isPublishing:Boolean    = false,
    val error:       String?    = null,
)

@HiltViewModel
class ItineraryDetailViewModel @Inject constructor(
    private val api: ApiClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ItineraryDetailUiState())
    val uiState: StateFlow<ItineraryDetailUiState> = _uiState.asStateFlow()

    fun load(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                data class Resp(val itinerary: Itinerary)
                val r: Resp = api.get("/itineraries/$id")
                _uiState.update { it.copy(isLoading = false, itinerary = r.itinerary) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun publish(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isPublishing = true) }
            try {
                data class Resp(val itinerary: Itinerary)
                val r: Resp = api.post("/itineraries/$id/publish")
                _uiState.update { it.copy(isPublishing = false, itinerary = r.itinerary) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isPublishing = false, error = e.message) }
            }
        }
    }
}

// ── Screen ─────────────────────────────────────────────────────────────────

@Composable
fun ItineraryDetailScreen(
    itineraryId:    String,
    onExpensesClick: () -> Unit = {},
    vm:             ItineraryDetailViewModel = hiltViewModel(),
) {
    val uiState by vm.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(itineraryId) { vm.load(itineraryId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.itinerary?.title ?: "Roteiro", fontWeight = FontWeight.Bold, maxLines = 1) },
                actions = {
                    if (uiState.itinerary?.status == Itinerary.Status.draft) {
                        TextButton(
                            onClick  = { vm.publish(itineraryId) },
                            enabled  = !uiState.isPublishing,
                        ) {
                            if (uiState.isPublishing)
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            else
                                Text("Publicar")
                        }
                    }
                }
            )
        }
    ) { padding ->
        when {
            uiState.isLoading && uiState.itinerary == null ->
                Column(Modifier.padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ShimmerBox(Modifier.fillMaxWidth().height(220.dp))
                    ShimmerBox(Modifier.width(240.dp).height(24.dp))
                    ShimmerBox(Modifier.width(160.dp).height(16.dp))
                }

            uiState.error != null && uiState.itinerary == null ->
                Box(Modifier.fillMaxSize().padding(padding)) {
                    EmptyState(icon = Icons.Default.ErrorOutline, title = "Erro",
                        message = uiState.error!!, action = "Tentar" to { vm.load(itineraryId) })
                }

            uiState.itinerary != null ->
                ItineraryDetailContent(
                    itinerary    = uiState.itinerary!!,
                    modifier     = Modifier.padding(padding),
                    onExpenses   = onExpensesClick,
                )
        }
    }
}

@Composable
fun ItineraryDetailContent(
    itinerary:  Itinerary,
    modifier:   Modifier = Modifier,
    onExpenses: () -> Unit,
) {
    var expandedDayId by remember { mutableStateOf<String?>(null) }

    LazyColumn(modifier = modifier) {
        // Cover
        item {
            Box(Modifier.fillMaxWidth().height(200.dp).background(MemoVoyBlue.copy(alpha = 0.1f))) {
                if (itinerary.coverImageUrl != null) {
                    AsyncImage(model = itinerary.coverImageUrl, contentDescription = null,
                        contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Box(Modifier.fillMaxSize(), Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.Flight, contentDescription = null,
                                modifier = Modifier.size(48.dp), tint = MemoVoyBlue.copy(alpha = 0.3f))
                            Text(itinerary.destinationName, style = MaterialTheme.typography.titleMedium,
                                color = MemoVoyBlue)
                        }
                    }
                }
                // Badges
                Row(Modifier.align(Alignment.TopStart).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (itinerary.status == Itinerary.Status.draft) {
                        Surface(color = MaterialTheme.colorScheme.tertiary, shape = MaterialTheme.shapes.extraLarge) {
                            Text("Rascunho", modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onTertiary,
                                fontWeight = FontWeight.Bold)
                        }
                    }
                    if (itinerary.aiGenerated) {
                        Surface(color = MemoVoyBlue.copy(alpha = 0.9f), shape = MaterialTheme.shapes.extraLarge) {
                            Text("✨ IA", modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelSmall, color = androidx.compose.ui.graphics.Color.White,
                                fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Info principal
        item {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(itinerary.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    InfoTag("📍", itinerary.destinationName)
                    InfoTag("🗓", "${itinerary.durationDays} dias")
                    InfoTag("👥", itinerary.groupType.label)
                }
                if (itinerary.startDate.isNotEmpty()) {
                    Text("${itinerary.startDate} → ${itinerary.endDate}",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        // Carbono
        itinerary.totalKgCo2?.let { co2 ->
            item {
                Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    colors = CardDefaults.cardColors(containerColor = MemoVoyGreen.copy(alpha = 0.06f))) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Eco, contentDescription = null,
                                    tint = MemoVoyGreen, modifier = Modifier.size(18.dp))
                                Text("Pegada de carbono", style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.SemiBold, color = MemoVoyGreen)
                            }
                            Text("${co2.toInt()} kg CO₂", style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold)
                        }
                        itinerary.carbonVsAvgPct?.let { pct ->
                            Text(
                                if (pct < 0) "↓ ${Math.abs(pct.toInt())}% abaixo da média"
                                else "↑ ${pct.toInt()}% acima da média",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (pct < 0) MemoVoyGreen else MaterialTheme.colorScheme.tertiary,
                            )
                        }
                    }
                }
            }
        }

        // Acções
        item {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onExpenses) {
                    Icon(Icons.Default.CreditCard, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Gastos")
                }
            }
        }

        // Programa por dias
        itinerary.days?.let { days ->
            item {
                Text("Programa", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }
            items(days.size) { i ->
                val day = days[i]
                val expanded = expandedDayId == day.id
                DayAccordion(
                    day      = day,
                    expanded = expanded,
                    onToggle = { expandedDayId = if (expanded) null else day.id },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
fun InfoTag(icon: String, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(icon, fontSize = 12.sp)
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun DayAccordion(day: ItineraryDay, expanded: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    Card(modifier = modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(1.dp)) {
        Column {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = MemoVoyBlue.copy(alpha = 0.1f), shape = MaterialTheme.shapes.extraLarge) {
                            Text("Dia ${day.dayNumber}",
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                                style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MemoVoyBlue)
                        }
                        day.theme?.let { Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold) }
                    }
                    Text(day.date, style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            // Actividades
            if (expanded) {
                HorizontalDivider()
                day.notes?.let { notes ->
                    Text(notes, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp))
                    HorizontalDivider()
                }
                if (day.activities.isEmpty()) {
                    Text("Sem actividades.", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(14.dp))
                } else {
                    day.activities.forEach { act ->
                        ActivityRow(act)
                        HorizontalDivider(modifier = Modifier.padding(horizontal = 14.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun ActivityRow(act: Activity) {
    Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(color = MemoVoyBlue.copy(alpha = 0.08f), shape = MaterialTheme.shapes.extraLarge) {
            Text(act.category?.icon ?: "📍",
                modifier = Modifier.padding(8.dp), fontSize = 18.sp)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(act.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f))
                act.startTime?.let { Text(it, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            act.address?.let { Text(it, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                act.durationMinutes?.let { Text("⏱ ${it}min", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant) }
                act.priceEstimate?.let { price ->
                    Text(if (price == 0) "🆓 Grátis" else "💶 €${price/100}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (act.aiSuggested) Text("✨ IA", style = MaterialTheme.typography.labelSmall, color = MemoVoyBlue)
            }
            act.aiWarning?.let {
                Surface(color = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.5f),
                    shape = MaterialTheme.shapes.small) {
                    Text("⚠️ $it", style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                }
            }
        }
    }
}
