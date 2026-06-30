// com/memovoy/features/itineraries/ItinerariesScreen.kt
package com.memovoy.features.itineraries

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.memovoy.core.models.Itinerary
import com.memovoy.core.network.ApiClient
import com.memovoy.shared.theme.MemoVoyBlue
import com.memovoy.shared.ui.EmptyState
import com.memovoy.shared.ui.ShimmerBox
import com.memovoy.shared.ui.toFormattedDate
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

// ── ViewModel ──────────────────────────────────────────────────────────────

data class ItinerariesUiState(
    val itineraries: List<Itinerary> = emptyList(),
    val isLoading:   Boolean         = false,
    val error:       String?         = null,
    val filter:      Itinerary.Status? = null,
)

@HiltViewModel
class ItinerariesViewModel @Inject constructor(
    private val api: ApiClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ItinerariesUiState())
    val uiState: StateFlow<ItinerariesUiState> = _uiState.asStateFlow()

    init { load() }

    fun load(filter: Itinerary.Status? = _uiState.value.filter) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null, filter = filter) }
            try {
                data class Resp(val itineraries: List<Itinerary>)
                val params = buildMap<String, Any> {
                    put("limit", 50)
                    filter?.let { put("status", it.name) }
                }
                val r: Resp = api.get("/itineraries/mine", params)
                _uiState.update { it.copy(isLoading = false, itineraries = r.itineraries) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                api.delete("/itineraries/$id")
                _uiState.update { it.copy(itineraries = it.itineraries.filter { i -> i.id != id }) }
            } catch (_: Exception) {}
        }
    }
}

// ── Screen ─────────────────────────────────────────────────────────────────

@Composable
fun ItinerariesScreen(
    onItineraryClick: (String) -> Unit,
    onCreateClick:    () -> Unit,
    vm:               ItinerariesViewModel = hiltViewModel(),
) {
    val uiState by vm.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title  = { Text("Os meus roteiros", fontWeight = FontWeight.Bold) },
                actions = {
                    IconButton(onClick = onCreateClick) {
                        Icon(Icons.Default.Add, contentDescription = "Criar roteiro")
                    }
                }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            // Filter chips
            Row(
                modifier              = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(null to "Todos", Itinerary.Status.published to "Publicados",
                       Itinerary.Status.draft to "Rascunhos").forEach { (status, label) ->
                    FilterChip(
                        selected = uiState.filter == status,
                        onClick  = { vm.load(status) },
                        label    = { Text(label, style = MaterialTheme.typography.labelMedium) },
                    )
                }
            }

            when {
                uiState.isLoading && uiState.itineraries.isEmpty -> {
                    LazyColumn {
                        items(5) { ShimmerBox(Modifier.fillMaxWidth().height(120.dp).padding(horizontal = 16.dp, vertical = 6.dp)) }
                    }
                }
                uiState.itineraries.isEmpty -> {
                    EmptyState(
                        icon    = Icons.Default.Map,
                        title   = "Sem roteiros",
                        message = "Cria o teu primeiro roteiro manualmente ou com IA.",
                        action  = "Criar roteiro" to onCreateClick,
                    )
                }
                else -> {
                    LazyColumn(
                        contentPadding      = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(uiState.itineraries, key = { it.id }) { itinerary ->
                            ItineraryCard(
                                itinerary = itinerary,
                                onClick   = { onItineraryClick(itinerary.id) },
                                onDelete  = { vm.delete(itinerary.id) },
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── ItineraryCard ──────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItineraryCard(
    itinerary: Itinerary,
    onClick:   () -> Unit,
    onDelete:  () -> Unit,
) {
    var showDeleteDialog by remember { mutableStateOf(false) }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title    = { Text("Apagar roteiro?") },
            text     = { Text("Esta acção é irreversível.") },
            confirmButton = {
                TextButton(onClick = { showDeleteDialog = false; onDelete() }) {
                    Text("Apagar", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Cancelar") }
            }
        )
    }

    Card(
        onClick   = onClick,
        modifier  = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column {
            // Cover
            Box(modifier = Modifier.fillMaxWidth().height(130.dp)) {
                if (itinerary.coverImageUrl != null) {
                    AsyncImage(
                        model              = itinerary.coverImageUrl,
                        contentDescription = null,
                        contentScale       = ContentScale.Crop,
                        modifier           = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(Modifier.fillMaxSize().padding(16.dp), Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.Flight, contentDescription = null,
                                modifier = Modifier.size(32.dp), tint = MemoVoyBlue.copy(alpha = 0.4f))
                            Text(itinerary.destinationName, style = MaterialTheme.typography.titleSmall,
                                color = MemoVoyBlue)
                        }
                    }
                }
                // Status badge
                Surface(
                    modifier = Modifier.padding(8.dp),
                    color    = when (itinerary.status) {
                        Itinerary.Status.published -> MaterialTheme.colorScheme.primary
                        Itinerary.Status.draft     -> MaterialTheme.colorScheme.tertiary
                        Itinerary.Status.archived  -> MaterialTheme.colorScheme.outline
                    },
                    shape    = MaterialTheme.shapes.extraLarge,
                ) {
                    Text(
                        text     = when (itinerary.status) {
                            Itinerary.Status.published -> "Publicado"
                            Itinerary.Status.draft     -> "Rascunho"
                            Itinerary.Status.archived  -> "Arquivado"
                        },
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        style    = MaterialTheme.typography.labelSmall,
                        color    = MaterialTheme.colorScheme.onPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                }
                // AI badge
                if (itinerary.aiGenerated) {
                    Surface(
                        modifier = Modifier.align(Alignment.TopEnd).padding(8.dp),
                        color    = MaterialTheme.colorScheme.primaryContainer,
                        shape    = MaterialTheme.shapes.extraLarge,
                    ) {
                        Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AutoAwesome, contentDescription = null,
                                modifier = Modifier.size(12.dp), tint = MaterialTheme.colorScheme.primary)
                            Text("IA", style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // Info
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(itinerary.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 2)

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    InfoChip(Icons.Default.LocationOn, itinerary.destinationName)
                    InfoChip(Icons.Default.CalendarMonth, "${itinerary.durationDays} dias")
                    InfoChip(Icons.Default.Group, itinerary.groupType.label)
                }

                // Carbono
                itinerary.totalKgCo2?.let { co2 ->
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Default.Eco, contentDescription = null,
                            modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.secondary)
                        Text("${co2.toInt()} kg CO₂", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.secondary)
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    InfoChip(Icons.Default.BookmarkBorder, "${itinerary.savesCount}")
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = { showDeleteDialog = true }, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.DeleteOutline, contentDescription = "Apagar",
                            tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun InfoChip(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(12.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text, style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }
}
