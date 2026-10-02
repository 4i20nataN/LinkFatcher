import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.linkfetcher.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.linkfetcher.app"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    ndk {
        // Corte de peso (2026-10-01, meta APK ≤120MB): só ABIs físicas.
        // x86/x86_64 = emulador + Chromebook. NÃO é splits (enterrado em
        // 2026-09-30: IncrementalSplitterRunnable × useLegacyPackaging, e o
        // split que empacotou saiu com o mesmo peso). Este filtro é intenção
        // + fallback; a EXECUÇÃO está no `packaging.jniLibs.excludes` abaixo
        // (medido: abiFilters sozinho não filtra neste projeto). Caminho de
        // volta se um dia importar: flavors per-ABI (plano item #2:
        // LinkFetcher-<abi>.apk, updater já tem fallback).
        abiFilters.addAll(listOf("arm64-v8a", "armeabi-v7a"))
    }
    }
    packaging {
        jniLibs {
            useLegacyPackaging = true
            // Corte de peso (2026-10-01, meta download ≤120MB): x86/x86_64
            // = emulador/Chromebook. ATENÇÃO: `ndk.abiFilters` (defaultConfig
            // acima + flavors do RustPlugin) NÃO filtra neste projeto —
            // medido nos intermediates: até flavors per-arch de 1 ABI
            // (armDebug, x86_64Debug) mesclam as 4 ABIs. O que vale é este
            // excludes, aplicado no packaging final, incondicional.
            excludes += setOf("lib/x86/*", "lib/x86_64/*")
        }
    }
    signingConfigs {
        // Release assinado via key.properties (gitignored, ver gen/android/.gitignore).
        // Sem o arquivo, o release sai unsigned (não instala) — o build não quebra.
        create("release") {
            val keyProps = Properties()
            // key.properties mora na raiz do projeto android (gen/android/),
            // não em app/ — rootProject.file resolve o diretório certo.
            val keyFile = rootProject.file("key.properties")
            if (keyFile.exists()) {
                keyFile.inputStream().use { keyProps.load(it) }
                storeFile = file(keyProps.getProperty("storeFile"))
                storePassword = keyProps.getProperty("storePassword")
                keyAlias = keyProps.getProperty("keyAlias")
                keyPassword = keyProps.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")

    val youtubedlAndroid = "0.18.1"
    implementation("io.github.junkfood02.youtubedl-android:library:$youtubedlAndroid")
    implementation("io.github.junkfood02.youtubedl-android:ffmpeg:$youtubedlAndroid")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")