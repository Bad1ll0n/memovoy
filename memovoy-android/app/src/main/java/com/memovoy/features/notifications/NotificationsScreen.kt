// com/memovoy/features/notifications/NotificationsScreen.kt
package com.memovoy.features.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.memovoy.core.models.AppNotification
import com.memovoy.core.network.ApiClient
import com.memovoy.shared.theme.MemoVoyAmber
import com.memovoy.shared.theme.MemoVoyBlue
import com.memovoy.shared.theme.MemoVoyGreen
import com.memovoy.shared.ui.EmptyState
import com.memovoy.shared.ui.ShimmerBox
import com.memovoy.shared.ui.toRelative
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

// ---------------------------------------------------------------------------
// UiState
// ---------------------------------------------------------------------------

data class NotificationsUiState(
    val notifications: List<AppNotification> = emptyList(),
    val isLoading:     Boolean               = false,
    val isRefreshing:  Boolean               = false,
    val hasMore:       Boolean               = true,
    val error:         String?               = null,
    val unreadCount:   Int                   = 0,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val api: ApiClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()

    private var cursor: String? = null

    private data class NotifResponse(
        val items: List<AppNotification>,
        val hasMore: Boolean,
        val nextCursor: String? = null,
    )

    private data class CountResponse(val count: Int)

    init { load() }

    fun load() {
        if (_uiState.value.isLoading) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            cursor = null
            try {
                val r: NotifResponse = api.get("/notifications", mapOf("limit" to 30))
                _uiState.update {
                    it.copy(isLoading = false, notifications = r.items, hasMore = r.hasMore)
                }
                cursor = r.nextCursor
                refreshUnreadCount()
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            cursor = null
            try {
                val r: NotifResponse = api.get("/notifications", mapOf("limit" to 30))
                _uiState.update {
                    it.copy(isRefreshing = false, notifications = r.items,
                        hasMore = r.hasMore, error = null)
                }
                cursor = r.nextCursor
                refreshUnreadCount()
            } catch (_: Exception) {
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (state.isLoading || !state.hasMore) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val params = buildMap<String, Any> {
                    put("limit", 30)
                    cursor?.let { put("cursor", it) }
                }
                val r: NotifResponse = api.get("/notifications", params)
                val ids = _uiState.value.notifications.map { it.id }.toSet()
                _uiState.update {
                    it.copy(
                        isLoading     = false,
                        notifications = it.notifications + r.items.filter { n -> n.id !in ids },
                        hasMore       = r.hasMore,
                    )
                }
                cursor = r.nextCursor
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun markRead(id: String) {
        // Optimistic: actualizar localmente imediatamente
        _uiState.update { state ->
            state.copy(
                notifications = state.notifications.map { n ->
                    if (n.id == id) n.copy(readAt = "now", status = "read") else n
                },
                unreadCount = maxOf(0, state.unreadCount - 1),
            )
        }
        viewModelScope.launch {
            try {
                api.patch<Unit>("/notifications/$id/read")
            } catch (_: Exception) {
                // Silencioso — a UI já está actualizada, não reverter
            }
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            try {
                api.patch<Unit>("/notifications/read-all")
                _uiState.update { state ->
                    state.copy(
                        notifications = state.notifications.map { it.copy(readAt = "now", status = "read") },
                        unreadCount   = 0,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    private suspend fun refreshUnreadCount() {
        try {
            val r: CountResponse = api.get("/notifications/unread-count")
            _uiState.update { it.copy(unreadCount = r.count) }
        } catch (_: Exception) { }
    }
}

// ---------------------------------------------------------------------------
// NotificationsScreen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    vm: NotificationsViewModel = hiltViewModel(),
) {
    val uiState   by vm.uiState.collectAsStateWithLifecycle()
    val pullState = rememberPullToRefreshState()

    if (pullState.isRefreshing) {
        LaunchedEffect(Unit) { vm.refresh(); pullState.endRefresh() }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title  = {
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Notificações", fontWeight = FontWeight.Bold)
                        if (uiState.unreadCount > 0) {
                            Badge { Text("${uiState.unreadCount}") }
                        }
                    }
                },
                actions = {
                    if (uiState.unreadCount > 0) {
                        TextButton(onClick = { vm.markAllRead() }) {
                            Text("Marcar todas", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .padding(padding)
                .nestedScroll(pullState.nestedScrollConnection)
        ) {
            when {
                uiState.isLoading && uiState.notifications.isEmpty ->
                    NotificationsSkeleton()

                uiState.error != null && uiState.notifications.isEmpty ->
                    EmptyState(
                        icon    = Icons.Default.WifiOff,
                        title   = "Sem ligação",
                        message = uiState.error!!,
                        action  = "Tentar novamente" to { vm.load() },
                    )

                uiState.notifications.isEmpty ->
                    EmptyState(
                        icon    = Icons.Default.NotificationsNone,
                        title   = "Sem notificações",
                        message = "Quando alguém interagir com o teu conteúdo verás aqui.",
                    )

                else ->
                    LazyColumn {
                        itemsIndexed(
                            items = uiState.notifications,
                            key   = { _, n -> n.id },
                        ) { index, notification ->
                            NotificationRow(
                                notification = notification,
                                onMarkRead   = { if (!notification.isRead) vm.markRead(notification.id) },
                            )
                            HorizontalDivider(thickness = 0.5.dp)

                            // Paginação
                            if (index >= uiState.notifications.size - 5 && uiState.hasMore) {
                                LaunchedEffect(index) { vm.loadMore() }
                            }
                        }

                        if (uiState.isLoading && uiState.notifications.isNotEmpty()) {
                            item {
                                Box(
                                    modifier         = Modifier.fillMaxWidth().padding(16.dp),
                                    contentAlignment = Alignment.Center,
                                ) { CircularProgressIndicator(modifier = Modifier.size(24.dp)) }
                            }
                        }
                    }
            }

            PullToRefreshContainer(
                state    = pullState,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// NotificationRow
// ---------------------------------------------------------------------------

@Composable
fun NotificationRow(
    notification: AppNotification,
    onMarkRead:   () -> Unit,
) {
    val (icon, tint) = notificationIconAndTint(notification.type)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (!notification.isRead)
                    MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.25f)
                else Color.Transparent
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment     = Alignment.Top,
    ) {
        // Ícone
        Surface(
            modifier = Modifier.size(44.dp),
            color    = tint.copy(alpha = 0.12f),
            shape    = MaterialTheme.shapes.extraLarge,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
            }
        }

        // Conteúdo
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                text       = notification.title,
                style      = MaterialTheme.typography.bodyMedium,
                fontWeight = if (!notification.isRead) FontWeight.SemiBold else FontWeight.Normal,
                maxLines   = 2,
            )
            notification.body?.let {
                Text(
                    text     = it,
                    style    = MaterialTheme.typography.bodySmall,
                    color    = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                )
            }
            Text(
                text  = notification.createdAt.toRelative(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // Indicador não-lida + botão de marcar
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (!notification.isRead) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(MaterialTheme.colorScheme.primary, shape = MaterialTheme.shapes.extraLarge)
                )
                TextButton(
                    onClick       = onMarkRead,
                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                ) {
                    Text("Lida", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

private fun notificationIconAndTint(type: String): Pair<ImageVector, Color> = when (type) {
    "like"               -> Icons.Default.Favorite            to Color(0xFFE53935)
    "comment"            -> Icons.Default.ChatBubble          to MemoVoyBlue
    "follow",
    "follow_request"     -> Icons.Default.PersonAdd           to Color(0xFF7B1FA2)
    "challenge_complete" -> Icons.Default.Flag                to MemoVoyAmber
    "badge_earned"       -> Icons.Default.Star                to MemoVoyAmber
    "geo_alert"          -> Icons.Default.LocationOn          to MemoVoyGreen
    "session_suspicious" -> Icons.Default.Security            to Color(0xFFE53935)
    "carbon_milestone"   -> Icons.Default.Eco                 to MemoVoyGreen
    "day_summary"        -> Icons.Default.WbSunny             to MemoVoyAmber
    "itinerary_ready"    -> Icons.Default.CheckCircle         to MemoVoyGreen
    else                 -> Icons.Default.Notifications       to MemoVoyBlue
}

// ---------------------------------------------------------------------------
// Skeleton loading
// ---------------------------------------------------------------------------

@Composable
fun NotificationsSkeleton() {
    LazyColumn {
        items(8) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ShimmerBox(Modifier.size(44.dp).background(
                    color = Color.Transparent,
                    shape = MaterialTheme.shapes.extraLarge,
                ))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    ShimmerBox(Modifier.fillMaxWidth(0.7f).height(14.dp))
                    ShimmerBox(Modifier.fillMaxWidth(0.5f).height(11.dp))
                }
            }
            HorizontalDivider(thickness = 0.5.dp)
        }
    }
}
