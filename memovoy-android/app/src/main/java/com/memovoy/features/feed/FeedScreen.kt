// com/memovoy/features/feed/FeedScreen.kt
package com.memovoy.features.feed

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.memovoy.core.models.Post
import com.memovoy.core.network.ApiClient
import com.memovoy.core.network.ApiError
import com.memovoy.shared.theme.MemoVoyBlue
import com.memovoy.shared.ui.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import javax.inject.Inject

// ---------------------------------------------------------------------------
// UiState
// ---------------------------------------------------------------------------

data class FeedUiState(
    val posts:       List<Post> = emptyList(),
    val isLoading:   Boolean    = false,
    val isRefreshing:Boolean    = false,
    val hasMore:     Boolean    = true,
    val error:       String?    = null,
)

private data class FeedResponse(
    val items: List<Post>, val hasMore: Boolean, val nextCursor: String?
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val api: ApiClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FeedUiState())
    val uiState: StateFlow<FeedUiState> = _uiState.asStateFlow()

    private var cursor: String? = null

    init { loadInitial() }

    fun loadInitial() {
        if (_uiState.value.isLoading) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            cursor = null
            try {
                val r: FeedResponse = api.get("/feed", mapOf("limit" to 20))
                _uiState.update {
                    it.copy(isLoading = false, posts = r.items, hasMore = r.hasMore)
                }
                cursor = r.nextCursor
            } catch (e: ApiError) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            cursor = null
            try {
                val r: FeedResponse = api.get("/feed", mapOf("limit" to 20))
                _uiState.update {
                    it.copy(isRefreshing = false, posts = r.items, hasMore = r.hasMore, error = null)
                }
                cursor = r.nextCursor
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
                    put("limit", 20)
                    cursor?.let { put("cursor", it) }
                }
                val r: FeedResponse = api.get("/feed", params)
                val existingIds = _uiState.value.posts.map { it.id }.toSet()
                val newPosts    = r.items.filter { it.id !in existingIds }
                _uiState.update {
                    it.copy(isLoading = false, posts = it.posts + newPosts, hasMore = r.hasMore)
                }
                cursor = r.nextCursor
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun toggleLike(post: Post) {
        // Optimistic update
        _uiState.update { state ->
            state.copy(posts = state.posts.map { p ->
                if (p.id == post.id) p.copy(
                    viewerLiked = !p.viewerLiked,
                    likesCount  = if (p.viewerLiked) p.likesCount - 1 else p.likesCount + 1,
                ) else p
            })
        }
        viewModelScope.launch {
            try {
                data class LikeResp(val liked: Boolean)
                val r: LikeResp = api.post("/posts/${post.id}/like")
                // Reconciliar com resposta real
                _uiState.update { state ->
                    state.copy(posts = state.posts.map { p ->
                        if (p.id == post.id) p.copy(viewerLiked = r.liked) else p
                    })
                }
            } catch (_: Exception) {
                // Rollback
                _uiState.update { state ->
                    state.copy(posts = state.posts.map { p ->
                        if (p.id == post.id) post else p
                    })
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// FeedScreen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    onPostClick:     (String) -> Unit,
    vm:              FeedViewModel = hiltViewModel(),
) {
    val uiState by vm.uiState.collectAsStateWithLifecycle()
    val pullState = rememberPullToRefreshState()

    if (pullState.isRefreshing) {
        LaunchedEffect(Unit) {
            vm.refresh()
            pullState.endRefresh()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title  = { Text("MemoVoy", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).nestedScroll(pullState.nestedScrollConnection)) {
            when {
                uiState.isLoading && uiState.posts.isEmpty -> FeedSkeleton()
                uiState.error != null && uiState.posts.isEmpty -> ErrorState(
                    message = uiState.error!!,
                    onRetry = { vm.loadInitial() }
                )
                uiState.posts.isEmpty -> EmptyFeedState()
                else -> {
                    LazyColumn {
                        itemsIndexed(
                            items = uiState.posts,
                            key   = { _, post -> post.id },
                        ) { index, post ->
                            PostCard(
                                post      = post,
                                onLike    = { vm.toggleLike(post) },
                                onClick   = { onPostClick(post.id) },
                            )
                            HorizontalDivider(thickness = 0.5.dp)

                            // Trigger de paginação — 5 posts antes do fim
                            if (index >= uiState.posts.size - 5 && uiState.hasMore) {
                                LaunchedEffect(index) { vm.loadMore() }
                            }
                        }

                        if (uiState.isLoading && uiState.posts.isNotEmpty()) {
                            item { Box(Modifier.fillMaxWidth().padding(16.dp), Alignment.Center) {
                                CircularProgressIndicator(modifier = Modifier.size(24.dp))
                            }}
                        }
                    }
                }
            }

            PullToRefreshContainer(state = pullState, modifier = Modifier.align(Alignment.TopCenter))
        }
    }
}

// ---------------------------------------------------------------------------
// PostCard
// ---------------------------------------------------------------------------

@Composable
fun PostCard(
    post:    Post,
    onLike:  () -> Unit,
    onClick: () -> Unit,
) {
    Column(modifier = Modifier.clickable(onClick = onClick)) {
        // Header: avatar + username + localização
        Row(
            modifier            = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment   = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            AvatarImage(url = post.avatarUrl, size = 36.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(post.displayName, fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.bodyMedium)
                post.locationName?.let {
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        Icon(Icons.Default.LocationOn, contentDescription = null,
                            modifier = Modifier.size(12.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(it, style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            post.level?.let { LevelChip(it) }
        }

        // Media
        post.coverMedia?.let { media ->
            Box {
                AsyncImage(
                    model             = media.thumbnailUrl ?: media.url,
                    contentDescription = null,
                    contentScale      = ContentScale.Crop,
                    modifier          = Modifier.fillMaxWidth().aspectRatio(1.1f),
                )
                // Badge de múltiplos media
                if ((post.mediaCount ?: 0) > 1) {
                    Surface(
                        modifier = Modifier.align(Alignment.TopEnd).padding(8.dp),
                        color    = MaterialTheme.colorScheme.scrim.copy(alpha = 0.7f),
                        shape    = MaterialTheme.shapes.small,
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.PhotoLibrary, contentDescription = null,
                                modifier = Modifier.size(12.dp), tint = MaterialTheme.colorScheme.onPrimary)
                            Text("${post.mediaCount}", style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Caption
        post.caption?.let {
            Text(
                text     = it,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                style    = MaterialTheme.typography.bodySmall,
                maxLines = 3,
            )
        }

        // Acções
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onLike) {
                Icon(
                    imageVector = if (post.viewerLiked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                    contentDescription = "Like",
                    tint = if (post.viewerLiked) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                )
            }
            Text("${post.likesCount}", style = MaterialTheme.typography.bodySmall)

            Spacer(Modifier.width(8.dp))

            IconButton(onClick = onClick) {
                Icon(Icons.Default.ChatBubbleOutline, contentDescription = "Comentar")
            }
            Text("${post.commentsCount}", style = MaterialTheme.typography.bodySmall)

            Spacer(Modifier.weight(1f))

            Text(post.createdAt.toRelative(), style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ---------------------------------------------------------------------------
// Estados especiais
// ---------------------------------------------------------------------------

@Composable
fun FeedSkeleton() {
    LazyColumn {
        items(5) {
            PostCardSkeleton()
            HorizontalDivider(thickness = 0.5.dp)
        }
    }
}

@Composable
fun PostCardSkeleton() {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ShimmerBox(Modifier.size(36.dp).clip(androidx.compose.foundation.shape.CircleShape))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                ShimmerBox(Modifier.width(120.dp).height(12.dp))
                ShimmerBox(Modifier.width(80.dp).height(10.dp))
            }
        }
        ShimmerBox(Modifier.fillMaxWidth().aspectRatio(1.1f))
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
fun EmptyFeedState() {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.Group, contentDescription = null,
            modifier = Modifier.size(72.dp), tint = MaterialTheme.colorScheme.outline)
        Spacer(Modifier.height(16.dp))
        Text("Feed vazio", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text("Segue viajantes para ver as suas aventuras aqui.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable
fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.WifiOff, contentDescription = null,
            modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.outline)
        Spacer(Modifier.height(16.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = onRetry) { Text("Tentar novamente") }
    }
}
