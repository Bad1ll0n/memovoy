// com/memovoy/shared/theme/Theme.kt
package com.memovoy.shared.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Cores principais
val MemoVoyBlue   = Color(0xFF185FA5)
val MemoVoyGreen  = Color(0xFF0F6E50)
val MemoVoyAmber  = Color(0xFFEF9F27)

private val LightColorScheme = lightColorScheme(
    primary          = MemoVoyBlue,
    onPrimary        = Color.White,
    primaryContainer = Color(0xFFDCEAF8),
    secondary        = MemoVoyGreen,
    onSecondary      = Color.White,
    tertiary         = MemoVoyAmber,
    background       = Color(0xFFF7F7F5),
    surface          = Color.White,
    onBackground     = Color(0xFF1A1A1A),
    onSurface        = Color(0xFF1A1A1A),
    surfaceVariant   = Color(0xFFF0F0EC),
    outline          = Color(0xFFE8E8E4),
    error            = Color(0xFFE24B4A),
)

private val DarkColorScheme = darkColorScheme(
    primary          = Color(0xFF7BA8D9),
    onPrimary        = Color(0xFF0C2D4D),
    primaryContainer = Color(0xFF0C3366),
    secondary        = Color(0xFF5DCAA5),
    onSecondary      = Color(0xFF003828),
    tertiary         = Color(0xFFFFCC80),
    background       = Color(0xFF0F0F13),
    surface          = Color(0xFF1C1C24),
    onBackground     = Color(0xFFE8E6F0),
    onSurface        = Color(0xFFE8E6F0),
    surfaceVariant   = Color(0xFF1C1C24),
    outline          = Color(0xFF2A2A38),
    error            = Color(0xFFFF6B6B),
)

@Composable
fun MemoVoyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content:   @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colors,
        typography  = Typography(),  // defaults — personalizar com a font do MemoVoy
        shapes      = Shapes(
            small        = androidx.compose.foundation.shape.RoundedCornerShape(8),
            medium       = androidx.compose.foundation.shape.RoundedCornerShape(12),
            large        = androidx.compose.foundation.shape.RoundedCornerShape(16),
            extraLarge   = androidx.compose.foundation.shape.RoundedCornerShape(24),
        ),
        content     = content,
    )
}
