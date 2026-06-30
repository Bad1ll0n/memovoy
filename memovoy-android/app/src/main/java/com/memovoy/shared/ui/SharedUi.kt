// com/memovoy/shared/ui/SharedUi.kt
package com.memovoy.shared.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.*
import coil.compose.AsyncImage
import com.memovoy.shared.theme.MemoVoyAmber
import com.memovoy.shared.theme.MemoVoyBlue
import com.memovoy.shared.theme.MemoVoyGreen
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

// ---------------------------------------------------------------------------
// AvatarImage
// ---------------------------------------------------------------------------

@Composable
fun AvatarImage(url: String?, size: Dp) {
    if (url != null) {
        AsyncImage(
            model              = url,
            contentDescription = null,
            contentScale       = ContentScale.Crop,
            modifier           = Modifier.size(size).clip(CircleShape),
        )
    } else {
        Box(
            modifier         = Modifier.size(size).clip(CircleShape)
                .background(MemoVoyBlue.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector        = Icons.Default.Person,
                contentDescription = null,
                tint               = MemoVoyBlue,
                modifier           = Modifier.size(size * 0.55f),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// LevelChip
// ---------------------------------------------------------------------------

@Composable
fun LevelChip(level: String) {
    val (label, color) = when (level) {
        "explorer"     -> "Explorador"  to MemoVoyBlue
        "traveler"     -> "Viajante"    to MemoVoyGreen
        "nomad"        -> "Nómada"      to Color(0xFF7B1FA2)
        "globetrotter" -> "Globetrotter" to MemoVoyAmber
        else           -> level.replaceFirstChar { it.uppercase() } to MaterialTheme.colorScheme.secondary
    }
    Surface(
        color = color.copy(alpha = 0.12f),
        shape = MaterialTheme.shapes.extraLarge,
    ) {
        Text(
            text     = label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            color    = color,
            style    = MaterialTheme.typography.labelSmall,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
        )
    }
}

// ---------------------------------------------------------------------------
// ShimmerBox (skeleton loading)
// ---------------------------------------------------------------------------

@Composable
fun ShimmerBox(modifier: Modifier = Modifier) {
    val shimmerColors = listOf(
        MaterialTheme.colorScheme.surfaceVariant,
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        MaterialTheme.colorScheme.surfaceVariant,
    )

    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateAnim by transition.animateFloat(
        initialValue   = 0f,
        targetValue    = 1000f,
        animationSpec  = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "shimmer_translate",
    )

    val brush = Brush.linearGradient(
        colors     = shimmerColors,
        start      = Offset(translateAnim - 200f, 0f),
        end        = Offset(translateAnim, 0f),
    )

    Box(modifier = modifier.clip(MaterialTheme.shapes.small).background(brush))
}

// ---------------------------------------------------------------------------
// String extensions para datas ISO 8601
// ---------------------------------------------------------------------------

fun String.toRelative(): String = try {
    val instant  = Instant.parse(this)
    val now      = Instant.now()
    val minutes  = ChronoUnit.MINUTES.between(instant, now)
    val hours    = ChronoUnit.HOURS.between(instant, now)
    val days     = ChronoUnit.DAYS.between(instant, now)

    when {
        minutes < 1   -> "agora"
        minutes < 60  -> "${minutes}min"
        hours   < 24  -> "${hours}h"
        days    < 7   -> "${days}d"
        days    < 30  -> "${days / 7}sem"
        days    < 365 -> "${days / 30}mês"
        else          -> "${days / 365}a"
    }
} catch (_: Exception) { this }

fun String.toFormattedDate(): String = try {
    val instant  = Instant.parse(this + if (!this.contains('T')) "T00:00:00Z" else "")
    val local    = instant.atZone(ZoneId.systemDefault()).toLocalDate()
    DateTimeFormatter.ofPattern("d MMM yyyy",
        java.util.Locale("pt", "PT")).format(local)
} catch (_: Exception) { this }

// ---------------------------------------------------------------------------
// EmptyState reutilizável
// ---------------------------------------------------------------------------

@Composable
fun EmptyState(
    icon:    androidx.compose.ui.graphics.vector.ImageVector,
    title:   String,
    message: String,
    action:  Pair<String, () -> Unit>? = null,
) {
    Column(
        modifier            = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, contentDescription = null,
            modifier = Modifier.size(72.dp), tint = MaterialTheme.colorScheme.outline)
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium,
            fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium,
            color   = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        action?.let { (label, onClick) ->
            Spacer(Modifier.height(20.dp))
            OutlinedButton(onClick = onClick) { Text(label) }
        }
    }
}
