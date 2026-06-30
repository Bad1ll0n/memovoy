// com/memovoy/features/profile/ProfileScreen.kt
package com.memovoy.features.profile

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.*
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.memovoy.core.models.*
import com.memovoy.core.network.ApiClient
import com.memovoy.shared.theme.*
import com.memovoy.shared.ui.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

// ---------------------------------------------------------------------------
// UiState
// ---------------------------------------------------------------------------

data class ProfileUiState(
    val profile:         UserProfile?         = null,
    val gamification:    GamificationProfile? = null,
    val posts:           List<Post>           = emptyList(),
    val isLoading:       Boolean              = false,
    val isFollowLoading: Boolean              = false,
    val error:           String?              = null,
    val selectedTab:     Int                  = 0,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val api: ApiClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    fun load(userId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            // Carregar os 3 recursos em paralelo — falhas individuais não bloqueiam os outros
            val profileDef = async { runCatching { loadProfile(userId) } }
            val gamDef     = async { runCatching { loadGamification(userId) } }
            val postsDef   = async { runCatching { loadPosts(userId) } }

            val profile      = profileDef.await().getOrNull()
            val gamification = gamDef.await().getOrNull()
            val posts        = postsDef.await().getOrNull() ?: emptyList()

            _uiState.update {
                it.copy(
                    isLoading    = false,
                    profile      = profile,
                    gamification = gamification,
                    posts        = posts,
                    error        = if (profile == null) "Perfil não encontrado" else null,
                )
            }
        }
    }

    fun toggleFollow(userId: String) {
        val profile = _uiState.value.profile ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isFollowLoading = true) }
            try {
                val isFollowing = profile.viewer?.isFollowing == true || profile.viewer?.isFollowPending == true
                if (isFollowing) {
                    api.delete("/users/$userId/follow")
                } else {
                    data class FollowResp(val status: String)
                    api.post<FollowResp>("/users/$userId/follow")
                }
                // Recarregar perfil para estado actualizado
                _uiState.update { it.copy(profile = loadProfile(userId)) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            } finally {
                _uiState.update { it.copy(isFollowLoading = false) }
            }
        }
    }

    fun selectTab(tab: Int) {
        _uiState.update { it.copy(selectedTab = tab) }
    }

    private data class ProfileResp(val user: UserProfile)
    private data class PostsResp(val items: List<Post>, val hasMore: Boolean)

    private suspend fun loadProfile(userId: String): UserProfile {
        val r: ProfileResp = api.get("/users/$userId")
        return r.user
    }

    private suspend fun loadGamification(userId: String): GamificationProfile =
        api.get("/gamification/profile/$userId")

    private suspend fun loadPosts(userId: String): List<Post> {
        val r: PostsResp = api.get("/feed/users/$userId", mapOf("limit" to 18))
        return r.items
    }
}

// ---------------------------------------------------------------------------
// ProfileScreen
// ---------------------------------------------------------------------------

@Composable
fun ProfileScreen(
    userId:  String,
    onLogout: () -> Unit,
    isOwnProfile: Boolean = false,
    vm:      ProfileViewModel = hiltViewModel(),
) {
    val uiState by vm.uiState.collectAsStateWithLifecycle()
    var showSessionsDialog by remember { mutableStateOf(false) }

    LaunchedEffect(userId) { vm.load(userId) }

    if (showSessionsDialog) {
        SessionsDialog(onDismiss = { showSessionsDialog = false })
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (isOwnProfile) "O meu perfil"
                        else uiState.profile?.username?.let { "@$it" } ?: "Perfil",
                        fontWeight = FontWeight.Bold,
                    )
                },
                actions = {
                    if (isOwnProfile) {
                        IconButton(onClick = { showSessionsDialog = true }) {
                            Icon(Icons.Default.Security, contentDescription = "Sessões")
                        }
                        IconButton(onClick = onLogout) {
                            Icon(Icons.Default.Logout, contentDescription = "Sair",
                                tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            )
        }
    ) { padding ->
        when {
            uiState.isLoading && uiState.profile == null ->
                ProfileSkeleton(padding)

            uiState.error != null && uiState.profile == null ->
                Box(Modifier.fillMaxSize().padding(padding)) {
                    EmptyState(
                        icon    = Icons.Default.PersonOff,
                        title   = "Perfil não encontrado",
                        message = "Este utilizador pode não existir ou a conta foi removida.",
                    )
                }

            uiState.profile != null ->
                ProfileContent(
                    uiState      = uiState,
                    isOwnProfile = isOwnProfile,
                    onFollow     = { vm.toggleFollow(userId) },
                    onTabSelect  = { vm.selectTab(it) },
                    modifier     = Modifier.padding(padding),
                )
        }
    }
}

// ---------------------------------------------------------------------------
// Conteúdo principal
// ---------------------------------------------------------------------------

@Composable
fun ProfileContent(
    uiState:      ProfileUiState,
    isOwnProfile: Boolean,
    onFollow:     () -> Unit,
    onTabSelect:  (Int) -> Unit,
    modifier:     Modifier = Modifier,
) {
    val profile = uiState.profile ?: return

    LazyColumn(modifier = modifier) {
        // Header
        item {
            ProfileHeader(
                profile      = profile,
                isOwnProfile = isOwnProfile,
                onFollow     = onFollow,
                isFollowLoading = uiState.isFollowLoading,
            )
        }

        // Stats
        item { ProfileStats(profile = profile, gamification = uiState.gamification) }

        // Streak
        uiState.gamification?.streak?.let { streak ->
            if (streak.currentStreak > 0) {
                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                        color    = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.5f),
                        shape    = MaterialTheme.shapes.medium,
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("🔥", fontSize = 20.sp)
                            Text(
                                "${streak.currentStreak} meses consecutivos · Recorde: ${streak.longestStreak}",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }
        }

        // Tabs
        item {
            TabRow(
                selectedTabIndex = uiState.selectedTab,
                modifier         = Modifier.fillMaxWidth(),
            ) {
                listOf("Publicações", "Badges", "Desafios").forEachIndexed { i, label ->
                    Tab(
                        selected = uiState.selectedTab == i,
                        onClick  = { onTabSelect(i) },
                        text     = { Text(label, style = MaterialTheme.typography.labelMedium) },
                    )
                }
            }
        }

        // Conteúdo da tab
        when (uiState.selectedTab) {
            0 -> {
                val canSee = profile.viewer?.canSeeContent != false
                if (!canSee) {
                    item {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Icon(Icons.Default.Lock, contentDescription = null,
                                modifier = Modifier.size(56.dp),
                                tint = MaterialTheme.colorScheme.outline)
                            Text("Conta privada", style = MaterialTheme.typography.titleSmall)
                            Text("Segue este utilizador para ver as suas publicações.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center)
                        }
                    }
                } else if (uiState.posts.isEmpty()) {
                    item {
                        EmptyState(
                            icon    = Icons.Default.PhotoLibrary,
                            title   = "Sem publicações",
                            message = "Ainda sem conteúdo partilhado.",
                        )
                    }
                } else {
                    // Grid 3×n
                    item {
                        val columns = 3
                        val rows = (uiState.posts.size + columns - 1) / columns
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            for (row in 0 until rows) {
                                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                    for (col in 0 until columns) {
                                        val idx = row * columns + col
                                        if (idx < uiState.posts.size) {
                                            val post = uiState.posts[idx]
                                            AsyncImage(
                                                model              = post.coverMedia?.thumbnailUrl ?: post.coverMedia?.url,
                                                contentDescription = null,
                                                contentScale       = ContentScale.Crop,
                                                modifier           = Modifier
                                                    .weight(1f)
                                                    .aspectRatio(1f),
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
            1 -> {
                val badges = uiState.gamification?.badges ?: emptyList()
                if (badges.isEmpty()) {
                    item {
                        EmptyState(
                            icon    = Icons.Default.Star,
                            title   = "Sem badges",
                            message = "Completa desafios para ganhar badges.",
                        )
                    }
                } else {
                    items(badges.chunked(3)) { row ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            row.forEach { badge ->
                                BadgeCard(badge = badge, modifier = Modifier.weight(1f))
                            }
                            // Preencher linha incompleta
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
            2 -> {
                val challenges = uiState.gamification?.activeChallenges ?: emptyList()
                if (challenges.isEmpty()) {
                    item {
                        EmptyState(
                            icon    = Icons.Default.Flag,
                            title   = "Sem desafios activos",
                            message = "Entra num desafio para acompanhar o progresso.",
                        )
                    }
                } else {
                    items(challenges, key = { it.id }) { challenge ->
                        ChallengeCard(challenge = challenge, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

@Composable
fun ProfileHeader(
    profile:         UserProfile,
    isOwnProfile:    Boolean,
    onFollow:        () -> Unit,
    isFollowLoading: Boolean,
) {
    Column(
        modifier            = Modifier.fillMaxWidth().padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Avatar
        AvatarImage(url = profile.profile.avatarUrl, size = 84.dp)

        // Nome + verificado
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment     = Alignment.CenterVertically,
            ) {
                Text(profile.profile.displayName,
                    style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                if (profile.isVerified) {
                    Icon(Icons.Default.Verified, contentDescription = "Verificado",
                        tint = MemoVoyBlue, modifier = Modifier.size(20.dp))
                }
            }
            Text("@${profile.username}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)

            profile.profile.bio?.let {
                Text(it, style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 16.dp))
            }

            LevelChip(profile.profile.level)
        }

        // Botão de seguir
        if (!isOwnProfile) {
            val followState = when {
                profile.viewer?.isFollowing    == true -> FollowState.FOLLOWING
                profile.viewer?.isFollowPending == true -> FollowState.PENDING
                else                                   -> FollowState.NOT_FOLLOWING
            }
            FollowButton(
                state     = followState,
                isLoading = isFollowLoading,
                onClick   = onFollow,
            )
        }
    }
}

enum class FollowState { NOT_FOLLOWING, PENDING, FOLLOWING }

@Composable
fun FollowButton(state: FollowState, isLoading: Boolean, onClick: () -> Unit) {
    val (text, containerColor, contentColor) = when (state) {
        FollowState.NOT_FOLLOWING -> Triple("Seguir",          MemoVoyBlue,                           Color.White)
        FollowState.PENDING       -> Triple("Pedido enviado",  MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurface)
        FollowState.FOLLOWING     -> Triple("A seguir",        MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurface)
    }

    Button(
        onClick  = onClick,
        modifier = Modifier.width(160.dp).height(38.dp),
        enabled  = !isLoading,
        colors   = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor   = contentColor,
        ),
        shape    = MaterialTheme.shapes.large,
    ) {
        if (isLoading) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
        } else {
            Text(text, style = MaterialTheme.typography.labelLarge)
        }
    }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

@Composable
fun ProfileStats(profile: UserProfile, gamification: GamificationProfile?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            .padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        StatItem("${profile.followerCount}",             "Seguidores")
        VerticalDivider(modifier = Modifier.height(32.dp))
        StatItem("${profile.profile.followingCount ?: 0}", "A seguir")
        VerticalDivider(modifier = Modifier.height(32.dp))
        StatItem("${profile.profile.totalTrips ?: 0}",    "Viagens")
        VerticalDivider(modifier = Modifier.height(32.dp))
        StatItem("${profile.profile.totalCountries ?: 0}", "Países")
        if (gamification != null) {
            VerticalDivider(modifier = Modifier.height(32.dp))
            StatItem("${gamification.stats.badgeCount}", "Badges")
        }
    }
}

@Composable
fun StatItem(value: String, label: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ---------------------------------------------------------------------------
// BadgeCard
// ---------------------------------------------------------------------------

@Composable
fun BadgeCard(badge: Badge, modifier: Modifier = Modifier) {
    Column(
        modifier            = modifier
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                MaterialTheme.shapes.medium)
            .padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        AsyncImage(
            model              = badge.iconUrl,
            contentDescription = badge.name,
            modifier           = Modifier.size(44.dp),
        )
        Text(badge.name,
            style     = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines  = 2)
        badge.earnedAt?.let {
            Text(it.toRelative(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ---------------------------------------------------------------------------
// ChallengeCard
// ---------------------------------------------------------------------------

@Composable
fun ChallengeCard(challenge: ChallengeProgress, modifier: Modifier = Modifier) {
    Card(
        modifier  = modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment     = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(challenge.title,
                        style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    challenge.locationName?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                challenge.rewardBadgeIcon?.let {
                    Text(it, fontSize = 24.sp)
                }
            }

            // Barra de progresso
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                LinearProgressIndicator(
                    progress = { challenge.progressPct / 100f },
                    modifier = Modifier.fillMaxWidth().height(7.dp).clip(MaterialTheme.shapes.extraLarge),
                    color    = MemoVoyBlue,
                )
                Row {
                    Text("${challenge.currentValue ?: 0} / ${challenge.targetValue}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.weight(1f))
                    Text("${challenge.progressPct}%",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MemoVoyBlue)
                }
            }

            challenge.endsAt?.let {
                Text("Termina ${it.toRelative()}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Sessions dialog
// ---------------------------------------------------------------------------

@Composable
fun SessionsDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon    = { Icon(Icons.Default.Security, contentDescription = null) },
        title   = { Text("Sessões activas") },
        text    = {
            Text("Gere os teus dispositivos activos em Definições → Segurança → Sessões.")
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Fechar") }
        },
    )
}

// ---------------------------------------------------------------------------
// Profile skeleton
// ---------------------------------------------------------------------------

@Composable
fun ProfileSkeleton(padding: PaddingValues) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(padding).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        ShimmerBox(Modifier.size(84.dp).clip(MaterialTheme.shapes.extraLarge))
        ShimmerBox(Modifier.width(160.dp).height(18.dp))
        ShimmerBox(Modifier.width(100.dp).height(13.dp))
        Spacer(Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            repeat(4) { ShimmerBox(Modifier.width(56.dp).height(40.dp)) }
        }
    }
}
