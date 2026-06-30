// com/memovoy/MainActivity.kt
package com.memovoy

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.*
import com.memovoy.features.auth.*
import com.memovoy.features.feed.FeedScreen
import com.memovoy.features.itineraries.ItinerariesScreen
import com.memovoy.features.notifications.NotificationsScreen
import com.memovoy.features.profile.ProfileScreen
import com.memovoy.features.wizard.WizardScreen
import com.memovoy.features.search.SearchScreen
import com.memovoy.features.itineraries.ItineraryDetailScreen
import com.memovoy.features.feed.PostDetailScreen
import com.memovoy.shared.theme.MemoVoyTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            MemoVoyTheme {
                MemoVoyApp()
            }
        }
    }
}

// ---------------------------------------------------------------------------
// App root — routing baseado no estado de auth
// ---------------------------------------------------------------------------

@Composable
fun MemoVoyApp() {
    val authVm: AuthViewModel = hiltViewModel()
    val authState by authVm.uiState.collectAsStateWithLifecycle()
    val navController = rememberNavController()

    // Observar eventos de navegação do AuthViewModel
    LaunchedEffect(Unit) {
        authVm.events.collect { event ->
            when (event) {
                is AuthEvent.NavigateToMain -> {
                    navController.navigate(Route.Main.route) {
                        popUpTo(Route.Auth.route) { inclusive = true }
                    }
                }
                is AuthEvent.NavigateToAuth -> {
                    navController.navigate(Route.Auth.route) {
                        popUpTo(Route.Main.route) { inclusive = true }
                    }
                }
                else -> {}
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = if (authState.isAuthenticated) Route.Main.route else Route.Auth.route,
    ) {
        // ── Auth flow ────────────────────────────────────────────────────
        navigation(startDestination = Route.Landing.route, route = Route.Auth.route) {
            composable(Route.Landing.route) {
                LandingScreen(
                    onLogin    = { navController.navigate(Route.Login.route) },
                    onRegister = { navController.navigate(Route.Register.route) },
                )
            }
            composable(Route.Login.route) {
                LoginScreen(onBack = { navController.popBackStack() })
            }
            composable(Route.Register.route) {
                RegisterScreen(onBack = { navController.popBackStack() })
            }
        }

        // ── Main flow (bottom nav) ────────────────────────────────────────
        composable(Route.Main.route) {
            MainScaffold(
                authVm        = authVm,
                onLogout      = { authVm.logout() },
            )
        }
    }
}

// ---------------------------------------------------------------------------
// MainScaffold — BottomNavigation + nested NavHost
// ---------------------------------------------------------------------------

@Composable
fun MainScaffold(
    authVm:   AuthViewModel,
    onLogout: () -> Unit,
) {
    val authState by authVm.uiState.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    // Tabs da bottom bar
    val tabs = listOf(
        BottomTab("feed",          "Feed",          Icons.Default.Home,              Icons.Default.Home),
        BottomTab("discovery",     "Explorar",      Icons.Default.Explore,           Icons.Default.Explore),
        BottomTab("search",        "Pesquisa",      Icons.Default.Search,            Icons.Default.Search),
        BottomTab("itineraries",   "Roteiros",      Icons.Default.Map,               Icons.Default.Map),
        BottomTab("notifications", "Notificações",  Icons.Default.NotificationsNone, Icons.Default.Notifications),
        BottomTab("profile",       "Perfil",        Icons.Default.PersonOutline,     Icons.Default.Person),
    )

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEach { tab ->
                    val isSelected = currentRoute == tab.route
                    NavigationBarItem(
                        selected   = isSelected,
                        onClick    = {
                            if (tab.route == "wizard") {
                                navController.navigate("wizard")
                            } else {
                                navController.navigate(tab.route) {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState    = true
                                }
                            }
                        },
                        icon  = { Icon(if (isSelected) tab.selectedIcon else tab.icon, tab.label) },
                        label = { Text(tab.label, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        }
    ) { padding ->
        NavHost(
            navController    = navController,
            startDestination = "feed",
            modifier         = Modifier.padding(padding),
        ) {
            composable("feed") {
                FeedScreen(onPostClick = { navController.navigate("post/$it") })
            }
            composable("discovery") {
                FeedScreen(onPostClick = { navController.navigate("post/$it") }) // Discovery usa FeedScreen com modo diferente
            }
            composable("itineraries") {
                ItinerariesScreen(
                    onItineraryClick  = { navController.navigate("itinerary/$it") },
                    onCreateClick     = { navController.navigate("wizard") },
                )
            }
            composable("notifications") {
                NotificationsScreen()
            }
            composable("profile") {
                ProfileScreen(
                    userId       = authState.currentUserId ?: "",
                    isOwnProfile = true,
                    onLogout     = onLogout,
                )
            }
            composable("search") {
                SearchScreen(
                    onItineraryClick = { navController.navigate("itinerary/$it") },
                    onProfileClick   = { navController.navigate("profile/$it") },
                    onPostClick      = { navController.navigate("post/$it") },
                )
            }
            composable("wizard") {
                WizardScreen(onDismiss = { navController.popBackStack() })
            }
            composable("itinerary/{id}") { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id") ?: ""
                ItineraryDetailScreen(
                    itineraryId = id,
                    onExpensesClick = { /* futuro: navegar para gastos */ },
                )
            }
            composable("post/{id}") { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id") ?: ""
                PostDetailScreen(
                    postId           = id,
                    onProfileClick   = { navController.navigate("profile/$it") },
                    onItineraryClick = { navController.navigate("itinerary/$it") },
                )
            }
        }
    }
}

data class BottomTab(
    val route:        String,
    val label:        String,
    val icon:         ImageVector,
    val selectedIcon: ImageVector,
)

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

sealed class Route(val route: String) {
    object Auth     : Route("auth")
    object Landing  : Route("landing")
    object Login    : Route("login")
    object Register : Route("register")
    object Main     : Route("main")
}
