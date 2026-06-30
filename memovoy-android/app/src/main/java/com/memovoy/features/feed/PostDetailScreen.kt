// com/memovoy/features/feed/PostDetailScreen.kt
package com.memovoy.features.feed

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.memovoy.core.models.*
import com.memovoy.core.network.ApiClient
import com.memovoy.shared.theme.MemoVoyBlue
import com.memovoy.shared.ui.AvatarImage
import com.memovoy.shared.ui.EmptyState
import com.memovoy.shared.ui.LevelChip
import com.memovoy.shared.ui.ShimmerBox
import com.memovoy.shared.ui.toRelative
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

// ── UiState ────────────────────────────────────────────────────────────────

data class PostDetailUiState(
    val post:         Post?   = null,
    val isLoading:    Boolean = false,
    val isLiking:     Boolean = false,
    val commentText:  String  = "",
    val replyToId:    String? = null,
    val replyToUser:  String? = null,
    val isSubmitting: Boolean = false,
    val error:        String? = null,
)

// ── ViewModel ──────────────────────────────────────────────────────────────

@HiltViewModel
class PostDetailViewModel @Inject constructor(
    private val api: ApiClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PostDetailUiState())
    val uiState: StateFlow<PostDetailUiState> = _uiState.asStateFlow()

    fun load(postId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                data class Resp(val post: Post)
                val r: Resp = api.get("/posts/$postId")
                _uiState.update { it.copy(isLoading = false, post = r.post) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun toggleLike(postId: String) {
        val post = _uiState.value.post ?: return
        // Optimistic
        _uiState.update { s ->
            s.copy(post = post.copy(
                viewerLiked = !post.viewerLiked,
                likesCount  = post.likesCount + if (post.viewerLiked) -1 else 1,
            ))
        }
        viewModelScope.launch {
            try {
                data class Resp(val liked: Boolean)
                val r: Resp = api.post("/posts/$postId/like")
                _uiState.update { s -> s.copy(post = s.post?.copy(viewerLiked = r.liked)) }
            } catch (_: Exception) {
                _uiState.update { s -> s.copy(post = post) } // rollback
            }
        }
    }

    fun setCommentText(text: String) { _uiState.update { it.copy(commentText = text) } }

    fun setReplyTo(id: String?, username: String?) {
        _uiState.update { it.copy(replyToId = id, replyToUser = username) }
    }

    fun submitComment(postId: String) {
        val text = _uiState.value.commentText.trim()
        if (text.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            try {
                val body = buildMap<String, Any> {
                    put("content", text)
                    _uiState.value.replyToId?.let { put("parentCommentId", it) }
                }
                data class Resp(val comment: Comment)
                api.post<Resp>("/posts/$postId/comments", body)
                _uiState.update { it.copy(isSubmitting = false, commentText = "", replyToId = null, replyToUser = null) }
                load(postId) // Recarregar comentários
            } catch (e: Exception) {
                _uiState.update { it.copy(isSubmitting = false, error = e.message) }
            }
        }
    }
}

// ── Screen ─────────────────────────────────────────────────────────────────

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun PostDetailScreen(
    postId:          String,
    onProfileClick:  (String) -> Unit = {},
    onItineraryClick:(String) -> Unit = {},
    vm:              PostDetailViewModel = hiltViewModel(),
) {
    val uiState      by vm.uiState.collectAsStateWithLifecycle()
    val commentFocus = remember { FocusRequester() }

    LaunchedEffect(postId) { vm.load(postId) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Publicação") }) },
        bottomBar = {
            PostCommentInput(
                uiState      = uiState,
                onTextChange = { vm.setCommentText(it) },
                onClearReply = { vm.setReplyTo(null, null) },
                onSubmit     = { vm.submitComment(postId) },
                focusReq     = commentFocus,
            )
        }
    ) { padding ->
        when {
            uiState.isLoading && uiState.post == null ->
                Column(Modifier.padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ShimmerBox(Modifier.fillMaxWidth().aspectRatio(1f))
                    ShimmerBox(Modifier.width(200.dp).height(14.dp))
                }

            uiState.post != null -> {
                val post = uiState.post!!
                LazyColumn(modifier = Modifier.padding(padding)) {
                    // Header
                    item {
                        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            AvatarImage(url = post.avatarUrl, size = 40.dp,
                                modifier = Modifier.clickable { onProfileClick(post.userId) })
                            Column(Modifier.weight(1f)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically) {
                                    Text(post.displayName, fontWeight = FontWeight.SemiBold,
                                        style = MaterialTheme.typography.bodyMedium,
                                        modifier = Modifier.clickable { onProfileClick(post.userId) })
                                    post.level?.let { LevelChip(it) }
                                }
                                post.locationName?.let {
                                    Text("📍 $it", style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            Text(post.createdAt.toRelative(), style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }

                    // Media carousel
                    post.media?.takeIf { it.isNotEmpty() }?.let { media ->
                        item {
                            val pagerState = rememberPagerState(pageCount = { media.size })
                            Box {
                                HorizontalPager(state = pagerState) { page ->
                                    AsyncImage(model = media[page].url, contentDescription = null,
                                        contentScale = ContentScale.Fit,
                                        modifier = Modifier.fillMaxWidth().aspectRatio(1f))
                                }
                                if (media.size > 1) {
                                    Row(Modifier.align(Alignment.BottomCenter).padding(8.dp),
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        media.indices.forEach { i ->
                                            Box(Modifier.size(if (i == pagerState.currentPage) 7.dp else 5.dp)
                                                .background(
                                                    if (i == pagerState.currentPage) androidx.compose.ui.graphics.Color.White
                                                    else androidx.compose.ui.graphics.Color.White.copy(alpha = 0.5f),
                                                    shape = MaterialTheme.shapes.extraLarge
                                                ))
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Acções
                    item {
                        Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onClick = { vm.toggleLike(postId) }) {
                                Icon(
                                    if (post.viewerLiked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                    contentDescription = "Like",
                                    tint = if (post.viewerLiked) MaterialTheme.colorScheme.error
                                           else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                            Text("${post.likesCount}", style = MaterialTheme.typography.bodySmall)
                            Spacer(Modifier.width(8.dp))
                            IconButton(onClick = { runCatching { commentFocus.requestFocus() } }) {
                                Icon(Icons.Default.ChatBubbleOutline, contentDescription = "Comentar")
                            }
                            Text("${post.commentsCount}", style = MaterialTheme.typography.bodySmall)
                            Spacer(Modifier.weight(1f))
                            post.itineraryId?.let { id ->
                                TextButton(onClick = { onItineraryClick(id) }) {
                                    Text("🗺 Ver roteiro", style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }

                    // Caption
                    post.caption?.let { caption ->
                        item {
                            Row(Modifier.padding(horizontal = 14.dp, vertical = 4.dp)) {
                                Text(post.username, fontWeight = FontWeight.SemiBold,
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.clickable { onProfileClick(post.userId) })
                                Text(" ")
                                Text(caption, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }

                    item { HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp)) }

                    // Comentários
                    val comments = post.comments ?: emptyList()
                    if (comments.isEmpty()) {
                        item {
                            Text("Sem comentários ainda. Sê o primeiro!",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        }
                    } else {
                        items(comments, key = { it.id }) { comment ->
                            CommentItem(
                                comment = comment,
                                onReply = {
                                    vm.setReplyTo(comment.id, comment.username)
                                    runCatching { commentFocus.requestFocus() }
                                },
                                onProfile = { onProfileClick(comment.userId) },
                            )
                            HorizontalDivider(modifier = Modifier.padding(start = 60.dp))
                        }
                    }

                    item { Spacer(Modifier.height(16.dp)) }
                }
            }

            else -> Box(Modifier.fillMaxSize()) {
                EmptyState(icon = Icons.Default.ErrorOutline, title = "Erro",
                    message = uiState.error ?: "Post não encontrado.",
                    action = "Tentar" to { vm.load(postId) })
            }
        }
    }
}

@Composable
fun CommentItem(comment: Comment, onReply: () -> Unit, onProfile: () -> Unit) {
    Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        AvatarImage(url = comment.avatarUrl, size = 32.dp, modifier = Modifier.clickable(onClick = onProfile))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row {
                Column(Modifier.weight(1f)) {
                    Text(comment.username, fontWeight = FontWeight.SemiBold,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.clickable(onClick = onProfile))
                    Text(comment.content, style = MaterialTheme.typography.bodySmall)
                }
                if (comment.viewerLiked || comment.likesCount > 0) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            if (comment.viewerLiked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = null, modifier = Modifier.size(16.dp),
                            tint = if (comment.viewerLiked) MaterialTheme.colorScheme.error
                                   else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (comment.likesCount > 0) Text("${comment.likesCount}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(comment.createdAt.toRelative(), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (comment.likesCount > 0) Text("${comment.likesCount} gostos",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Responder", style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clickable(onClick = onReply))
                comment.replyCount?.takeIf { it > 0 }?.let {
                    Text("Ver $it ${if (it == 1) "resposta" else "respostas"}",
                        style = MaterialTheme.typography.labelSmall, color = MemoVoyBlue)
                }
            }
        }
    }
}

@Composable
fun PostCommentInput(
    uiState:      PostDetailUiState,
    onTextChange: (String) -> Unit,
    onClearReply: () -> Unit,
    onSubmit:     () -> Unit,
    focusReq:     FocusRequester,
) {
    Surface(shadowElevation = 8.dp) {
        Column {
            uiState.replyToUser?.let { username ->
                Row(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment     = Alignment.CenterVertically,
                ) {
                    Text("↩ A responder a @$username",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    IconButton(onClick = onClearReply, modifier = Modifier.size(20.dp)) {
                        Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(14.dp))
                    }
                }
            }
            Row(
                Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment     = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value         = uiState.commentText,
                    onValueChange = onTextChange,
                    modifier      = Modifier.weight(1f).focusRequester(focusReq),
                    placeholder   = { Text(if (uiState.replyToUser != null) "Responder…" else "Adicionar comentário…",
                        style = MaterialTheme.typography.bodySmall) },
                    maxLines      = 3,
                    shape         = MaterialTheme.shapes.extraLarge,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        capitalization = KeyboardCapitalization.Sentences,
                        imeAction      = ImeAction.Send,
                    ),
                    keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSend = { onSubmit() }),
                )
                IconButton(
                    onClick  = onSubmit,
                    enabled  = uiState.commentText.isNotBlank() && !uiState.isSubmitting,
                ) {
                    if (uiState.isSubmitting) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Default.Send, contentDescription = "Enviar", tint = MemoVoyBlue)
                }
            }
        }
    }
}

// AvatarImage com modifier extra para clickable
@Composable
fun AvatarImage(url: String?, size: Dp, modifier: Modifier = Modifier) {
    com.memovoy.shared.ui.AvatarImage(url = url, size = size)
}
