// app/build.gradle.kts
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

android {
    namespace   = "com.memovoy"
    compileSdk  = 35

    defaultConfig {
        applicationId   = "com.memovoy"
        minSdk          = 26   // Android 8 — cobre 95%+ dos devices activos
        targetSdk       = 35
        versionCode     = 1
        versionName     = "1.0.0"

        // Certificate pins — substituir em produção com os hashes reais
        buildConfigField("String", "API_BASE_URL",    "\"https://api.memovoy.com\"")
        buildConfigField("String", "CERT_PIN_CURRENT", "\"sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\"")
        buildConfigField("String", "CERT_PIN_BACKUP",  "\"sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=\"")
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3000\"") // Emulador → localhost
            isDebuggable = true
        }
        release {
            isMinifyEnabled    = true
            isShrinkResources  = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose     = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    // Compose BOM — versões alinhadas automaticamente
    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Navigation
    implementation(libs.androidx.navigation.compose)

    // ViewModel + Lifecycle
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)

    // Hilt (DI)
    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    ksp(libs.hilt.compiler)

    // Ktor (HTTP client) + certificate pinning via OkHttp
    implementation(libs.ktor.client.android)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.ktor.client.logging)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)

    // Kotlinx Serialization
    implementation(libs.kotlinx.serialization.json)

    // Kotlinx Coroutines
    implementation(libs.kotlinx.coroutines.android)

    // DataStore (preferências e tokens — mais seguro que SharedPreferences)
    implementation(libs.androidx.datastore.preferences)

    // Coil (imagens assíncronas)
    implementation(libs.coil.compose)

    // Accompanist (permissões)
    implementation(libs.accompanist.permissions)

    // Google Maps Compose
    implementation(libs.maps.compose)
    implementation(libs.play.services.maps)

    // Splash screen
    implementation(libs.androidx.core.splashscreen)

    // Testes
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)   // Flow testing
    androidTestImplementation(composeBom)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
}
