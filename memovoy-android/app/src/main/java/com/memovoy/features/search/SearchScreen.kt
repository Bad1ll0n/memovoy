// com/memovoy/features/search/SearchScreen.kt
package com.memovoy.features.search

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.focus.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.memovoy.core.models.*
import com.memovoy.core.network.ApiClient
import com.memovoy.shared.theme.MemoVoyBlue
import com.memovoy.shared.ui.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.Serializable
import javax.inject.Inject

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

@Serializable
data class AutocompleteResponse(
    val destinations: List<AutoDest> = emptyList(),
    val users:        List<AutoUser> = emptyList(),
) {
    @Serializable data class AutoDest(val destinationName: String, val countryCode: String, val tripCount: Int)
    @Serializable data class AutoUser(val id: String, val username: String, val displayName: String,
                                       val avatarUrl: String? = null, val level: String, val isVerified: Boolean,
                                       val followerCount: Int)
}

@Serializable
data class SearchResponse(
    val itineraries: List<Itinerary>   = emptyList(),
    val users:       List<UserProfile> = emptyList(),
    val posts:       List<Post>        = emptyList(),
)

enum class SearchTab(val label: String) {
    ALL("Todos"), ITINERARIES("Roteiros"), USERS("Viajantes"), POSTS("Posts")
}

// ---------------------------------------------------------------------------
// UiState
// ---------------------------------------------------------------------------

data class SearchUiState(
    val query:        String              = "",
    val tab:          SearchTab           = SearchTab.ALL,
    val autocomplete: AutocompleteResponse? = null,
    val results:      SearchResponse?     = null,
    val isLoading:    Boolean             = false,
    val error:        String?             = null,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val api: ApiClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    fun onQueryChange(query: String) {
        _uiState.update { it.copy(query = query) }
        searchJob?.cancel()
        if (query.isBlank()) {
            _uiState.update { it.copy(autocomplete = null, results = null) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(300) // debounce
            performSearch(query.trim(), _uiState.value.tab)
        }
    }

    fun onTabChange(tab: SearchTab) {
        _uiState.update { it.copy(tab = tab) }
        val q = _uiState.value.query.trim()
        if (q.length >= 3) {
            viewModelScope.launch { performSearch(q, tab) }
        }
    }

    fun onAutocompleteSelect(term: String) {
        _uiState.update { it.copy(query = term, autocomplete = null) }
        viewModelScope.launch { performSearch(term, _uiState.value.tab) }
    }

    private suspend fun performSearch(q: String, tab: SearchTab) {
        when {
            q.length == 2 -> {
                try {
                    val auto: AutocompleteResponse = api.get("/search/autocomplete", mapOf("q" to q))
                    _uiState.update { it.copy(autocomplete = auto, results = null) }
                } catch (_: Exception) {}
            }
            q.length >= 3 -> {
                _uiState.update { it.copy(isLoading = true, error = null, autocomplete = null) }
                try {
                    val results: SearchResponse = api.get("/search", mapOf(
                        "q"     to q,
                        "type"  to tab.name.lowercase(),
                        "limit" to 20,
                    ))
                    _uiState.update { it.copy(isLoading = false, results = results) }
                } catch (e: Exception) {
                    _uiState.update { it.copy(isLoading = false, error = e.message) }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// SearchScreen
// ---------------------------------------------------------------------------

@Composable
fun SearchScreen(
    onItineraryClick: (String) -> Unit = {},
    onProfileClick:   (String) -> Unit = {},
    onPostClick:      (String) -> Unit = {},
    vm: SearchViewModel = hiltViewModel(),
) {
    val uiState  by vm.uiState.collectAsStateWithLifecycle()
    val focusReq = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        runCatching { focusReq.requestFocus() }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Campo de pesquisa
        OutlinedTextField(
            value         = uiState.query,
            onValueChange = { vm.onQueryChange(it) },
            modifier      = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .focusRequester(focusReq),
            placeholder   = { Text("Roteiros, destinos, viajantes…",
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)) },
            leadingIcon   = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon  = {
                if (uiState.query.isNotEmpty()) {
                    IconButton(onClick = { vm.onQueryChange("") }) {
                        Icon(Icons.Default.Clear, contentDescription = "Limpar")
                    }
                }
            },
            singleLine    = true,
            shape         = MaterialTheme.shapes.large,
            keyboardOptions   = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions   = KeyboardActions(onSearch = {}),
        )

        // Tabs
        if (uiState.results != null) {
            ScrollableTabRow(
                selectedTabIndex = SearchTab.entries.indexOf(uiState.tab),
                edgePadding      = 16.dp,
                divider          = {},
            ) {
                SearchTab.entries.forEach { tab ->
                    Tab(
                        selected = uiState.tab == tab,
                        onClick  = { vm.onTabChange(tab) },
                        text     = { Text(tab.label, style = MaterialTheme.typography.labelMedium) },
                    )
                }
            }
            HorizontalDivider()
        }

        // Conteúdo
        AnimatedContent(
            targetState   = Triple(uiState.query, uiState.autocomplete, uiState.results),
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            label         = "search_content",
        ) { (query, auto, results) ->
            when {
                query.isBlank() -> SearchPrompt(onSuggestionClick = { vm.onQueryChange(it) })

                auto != null -> AutocompleteList(
                    data     = auto,
                    onSelect = { vm.onAutocompleteSelect(it) },
                    onProfileClick = onProfileClick,
                )

                uiState.isLoading -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                    CircularProgressIndicator()
                }

                results != null -> SearchResults(
                    results          = results,
                    tab              = uiState.tab,
                    query            = query,
                    onItineraryClick = onItineraryClick,
                    onProfileClick   = onProfileClick,
                    onPostClick      = onPostClick,
                )

                query.length >= 3 -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                    EmptyState(
                        icon    = Icons.Default.SearchOff,
                        title   = "Sem resultados",
                        message = "Sem resultados para \"$query\".\nTenta termos diferentes.",
                    )
                }

                else -> Box(Modifier.fillMaxSize())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// SearchPrompt — ecrã inicial com sugestões
// ---------------------------------------------------------------------------

@Composable
fun SearchPrompt(onSuggestionClick: (String) -> Unit) {
    val suggestions = listOf("Tokyo","Lisboa","Bali","Paris","Brasil","Islândia","Nova York","Marrocos")
    Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
        Text("Destinos populares",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        LazyVerticalGrid(
            columns             = GridCells.Fixed(2),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(suggestions) { s ->
                OutlinedButton(
                    onClick  = { onSuggestionClick(s) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(s, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// AutocompleteList
// ---------------------------------------------------------------------------

@Composable
fun AutocompleteList(
    data:           AutocompleteResponse,
    onSelect:       (String) -> Unit,
    onProfileClick: (String) -> Unit,
) {
    LazyColumn {
        if (data.destinations.isNotEmpty()) {
            item {
                Text("Destinos", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }
            items(data.destinations) { dest ->
                ListItem(
                    headlineContent  = { Text(dest.destinationName) },
                    supportingContent = { Text("${dest.tripCount} roteiros",
                        style = MaterialTheme.typography.bodySmall) },
                    leadingContent   = { Text(countryFlag(dest.countryCode), fontSize = 22.sp) },
                    modifier         = Modifier.clickable { onSelect(dest.destinationName) },
                )
            }
        }
        if (data.users.isNotEmpty()) {
            item { HorizontalDivider() }
            item {
                Text("Viajantes", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }
            items(data.users, key = { it.id }) { u ->
                ListItem(
                    headlineContent  = { Text(u.displayName, fontWeight = FontWeight.SemiBold) },
                    supportingContent = { Text("@${u.username}", style = MaterialTheme.typography.bodySmall) },
                    leadingContent   = { AvatarImage(url = u.avatarUrl, size = 36.dp) },
                    modifier         = Modifier.clickable { onProfileClick(u.id) },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// SearchResults
// ---------------------------------------------------------------------------

@Composable
fun SearchResults(
    results:         SearchResponse,
    tab:             SearchTab,
    query:           String,
    onItineraryClick: (String) -> Unit,
    onProfileClick:   (String) -> Unit,
    onPostClick:      (String) -> Unit,
) {
    val hasResults = results.itineraries.isNotEmpty() ||
                     results.users.isNotEmpty()       ||
                     results.posts.isNotEmpty()

    if (!hasResults) {
        EmptyState(icon = Icons.Default.SearchOff, title = "Sem resultados",
            message = "Sem resultados para \"$query\".")
        return
    }

    LazyColumn {
        // Roteiros
        if ((tab == SearchTab.ALL || tab == SearchTab.ITINERARIES) && results.itineraries.isNotEmpty()) {
            if (tab == SearchTab.ALL) {
                item { SectionHeader("Roteiros") }
            }
            items(results.itineraries, key = { it.id }) { it ->
                ItinerarySearchRow(itinerary = it, onClick = { onItineraryClick(it.id) })
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
            }
        }
        // Utilizadores
        if ((tab == SearchTab.ALL || tab == SearchTab.USERS) && results.users.isNotEmpty()) {
            if (tab == SearchTab.ALL) {
                item { SectionHeader("Viajantes") }
            }
            items(results.users, key = { it.id }) { u ->
                UserSearchRow(user = u, onClick = { onProfileClick(u.id) })
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
            }
        }
        // Posts em grelha 3×n
        if ((tab == SearchTab.ALL || tab == SearchTab.POSTS) && results.posts.isNotEmpty()) {
            if (tab == SearchTab.ALL) {
                item { SectionHeader("Posts") }
            }
            item {
                val cols = 3
                val rows = (results.posts.size + cols - 1) / cols
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    for (row in 0 until rows) {
                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                            for (col in 0 until cols) {
                                val idx = row * cols + col
                                if (idx < results.posts.size) {
                                    val post = results.posts[idx]
                                    AsyncImage(
                                        model              = post.coverMedia?.thumbnailUrl ?: post.coverMedia?.url,
                                        contentDescription = null,
                                        contentScale       = ContentScale.Crop,
                                        modifier           = Modifier
                                            .weight(1f).aspectRatio(1f)
                                            .clickable { onPostClick(post.id) },
                                    )
                                } else {
                                    Spacer(Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SectionHeader(title: String) {
    Text(title,
        style     = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        modifier  = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

@Composable
fun ItinerarySearchRow(itinerary: Itinerary, onClick: () -> Unit) {
    Row(
        modifier  = Modifier.fillMaxWidth().clickable(onClick = onClick)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment     = Alignment.CenterVertically,
    ) {
        Card(
            modifier  = Modifier.size(60.dp),
            elevation = CardDefaults.cardElevation(0.dp),
            colors    = CardDefaults.cardColors(containerColor = MemoVoyBlue.copy(alpha = 0.08f)),
        ) {
            if (itinerary.coverImageUrl != null) {
                AsyncImage(model = itinerary.coverImageUrl, contentDescription = null,
                    contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Box(Modifier.fillMaxSize(), Alignment.Center) {
                    Text("✈️", fontSize = 22.sp)
                }
            }
        }

        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(itinerary.title, fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text("${itinerary.destinationName} · ${itinerary.durationDays} dias",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("🔖 ${itinerary.savesCount}", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (itinerary.aiGenerated) {
                    Text("✨ IA", style = MaterialTheme.typography.labelSmall, color = MemoVoyBlue)
                }
            }
        }
    }
}

@Composable
fun UserSearchRow(user: UserProfile, onClick: () -> Unit) {
    Row(
        modifier  = Modifier.fillMaxWidth().clickable(onClick = onClick)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment     = Alignment.CenterVertically,
    ) {
        AvatarImage(url = user.profile.avatarUrl, size = 44.dp)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(user.profile.displayName, fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.bodyMedium)
                if (user.isVerified) {
                    Icon(Icons.Default.Verified, contentDescription = null,
                        tint = MemoVoyBlue, modifier = Modifier.size(14.dp))
                }
                LevelChip(user.profile.level)
            }
            Text("@${user.username} · ${user.followerCount} seguidores",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (user.isPrivate) {
            Icon(Icons.Default.Lock, contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
        }
    }
}

fun countryFlag(code: String): String =
    code.uppercase().map { c ->
        String(Character.toChars(127397 + c.code))
    }.joinToString("")
