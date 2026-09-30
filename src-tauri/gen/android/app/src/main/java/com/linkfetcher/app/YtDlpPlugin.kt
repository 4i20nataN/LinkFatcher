package com.linkfetcher.app

import android.app.Activity
import android.content.Intent
import android.os.Environment
import android.util.Log
import android.webkit.MimeTypeMap
import android.webkit.WebView
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

private const val TAG = "YtDlpPlugin"

@InvokeArg
class ProbeArgs {
    var url: String = ""
    var proxy: String? = null
}

@InvokeArg
class SearchArgs {
    var query: String = ""
    var platform: String = "youtube"
    var maxResults: Int? = null
    var proxy: String? = null
}

@InvokeArg
class ExecuteArgs {
    var argv: List<String> = emptyList()
    var processId: String = ""
    // Rust marca true quando `--ppa` (normalizar/nitidez) foi removido do
    // argv mobile: o arquivo sai sem os filtros — avisa em vez de calar.
    var warnFilters: Boolean = false
    // Subpasta pública de destino (Downloads/<subdir>). Nulo/vazio = padrão.
    var publicSubdir: String? = null
    // Título p/ a notificação nativa de progresso/conclusão.
    var title: String = ""
}

@InvokeArg
class CancelArgs {
    var id: String = ""
    var cleanup: Boolean = false
}

@InvokeArg
class OpenArgs {
    var path: String = ""
}

@TauriPlugin
class YtDlpPlugin(private val activity: Activity) : Plugin(activity) {

    private val executor = Executors.newCachedThreadPool()
    private val lastPaths = ConcurrentHashMap<String, String>()
    private var webView: WebView? = null

    override fun load(webView: WebView) {
        super.load(webView)
        this.webView = webView
        // Pre-warm em background: a 1ª init extrai o env Python dos assets
        // (segundos em aparelho fraco). Sem isso, a 1ª análise pagava esse
        // custo dentro do probe, parecendo "lentidão ao analisar".
        executor.execute cmd@{
            val t0 = System.currentTimeMillis()
            ensureInitialized()
            Log.i(TAG, "pre-warm yt-dlp em ${System.currentTimeMillis() - t0}ms")
        }
    }

    private fun ensureInitialized() {
        try {
            val ctx = activity.applicationContext
            YoutubeDL.getInstance().init(ctx)
            FFmpeg.getInstance().init(ctx)
        } catch (e: Exception) {
            Log.d(TAG, "ensureInitialized aviso: ${e.message}")
        }
    }

    private fun emitOnUi(event: String, build: JSObject.() -> Unit) {
        val data = JSObject()
        data.build()
        val jsonStr = data.toString()
        activity.runOnUiThread {
            trigger(event, data)
            webView?.let { wv ->
                val escapedJson = JSONObject.quote(jsonStr)
                val js = "(function(){ try { var d = JSON.parse($escapedJson); window.dispatchEvent(new CustomEvent('$event', { detail: d })); if (typeof window.__onLinkFetcherProgress === 'function') { window.__onLinkFetcherProgress(d); } } catch(e){} })();"
                wv.evaluateJavascript(js, null)
            }
        }
    }

    // ---- probe: dump-json completo (paridade com o desktop) ----

    @Command
    fun probe(invoke: Invoke) {
        val args = invoke.parseArgs(ProbeArgs::class.java)
        if (args.url.isBlank()) {
            invoke.reject("URL vazia")
            return
        }
        executor.execute cmd@{
            ensureInitialized()
            val t0 = System.currentTimeMillis()
            try {
                val request = YoutubeDLRequest(args.url)
                request.addOption("--dump-json")
                request.addOption("--no-download")
                request.addOption("--no-playlist")
                request.addOption("--no-warnings")
                // Fail-fast em rede móvel instável: sem isso o probe usa os
                // retries padrão (10 + backoff) e trava a UI por minutos.
                request.addOption("--socket-timeout", "15")
                request.addOption("--retries", "2")
                args.proxy?.takeIf { it.isNotBlank() }?.let {
                    request.addOption("--proxy", it)
                }
                val response = YoutubeDL.getInstance().execute(request, "probe-${System.nanoTime()}")
                Log.i(TAG, "probe em ${System.currentTimeMillis() - t0}ms exit=${response.exitCode}")
                if (response.exitCode != 0) {
                    invoke.reject(cleanError(response.err.ifBlank { response.out }))
                    return@cmd
                }
                try {
                    invoke.resolve(JSObject(response.out))
                } catch (e: Exception) {
                    invoke.reject("probe: JSON inválido: ${e.message}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "probe falhou", e)
                invoke.reject(e.message ?: "Erro desconhecido ao obter metadados")
            }
        }
    }

    // ---- playlist: NDJSON parseado (mesma regra do desktop) ----

    @Command
    fun probePlaylist(invoke: Invoke) {
        val args = invoke.parseArgs(ProbeArgs::class.java)
        if (args.url.isBlank()) {
            invoke.reject("URL vazia")
            return
        }
        executor.execute cmd@{
            ensureInitialized()
            try {
                val request = YoutubeDLRequest(args.url)
                request.addOption("--flat-playlist")
                request.addOption("--dump-json")
                request.addOption("--no-download")
                request.addOption("--ignore-errors")
                request.addOption("--no-warnings")
                request.addOption("--socket-timeout", "15")
                request.addOption("--retries", "2")
                args.proxy?.takeIf { it.isNotBlank() }?.let {
                    request.addOption("--proxy", it)
                }
                val response = YoutubeDL.getInstance().execute(request, "playlist-${System.nanoTime()}")
                if (response.exitCode != 0 && response.out.isBlank()) {
                    invoke.reject(cleanError(response.err.ifBlank { response.out }))
                    return@cmd
                }
                val entries = JSONArray()
                var count: Long? = null
                var title: String? = null
                response.out.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.forEach { line ->
                    try {
                        val obj = JSONObject(line)
                        val isPlaylist = obj.optString("_type") == "playlist" || obj.has("playlist_count")
                        if (isPlaylist) {
                            if (count == null && obj.has("playlist_count")) count = obj.optLong("playlist_count")
                            if (title == null) {
                                obj.optString("title").takeIf { it.isNotEmpty() }?.let { title = it }
                            }
                        } else {
                            entries.put(obj)
                        }
                    } catch (_: Exception) { /* linha não-JSON: ignora */ }
                }
                if (count == null && entries.length() > 0) count = entries.length().toLong()
                if (title == null && entries.length() > 0) {
                    entries.optJSONObject(0)?.optString("playlist")
                        ?.takeIf { it.isNotEmpty() }?.let { title = it }
                }
                val ret = JSObject()
                ret.put("entries", entries)
                count?.let { ret.put("playlist_count", it) }
                title?.let { ret.put("title", it) }
                invoke.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "probePlaylist falhou", e)
                invoke.reject(e.message ?: "Erro desconhecido na playlist")
            }
        }
    }

    // ---- search: mesmos 9 campos do backend desktop ----

    @Command
    fun search(invoke: Invoke) {
        val args = invoke.parseArgs(SearchArgs::class.java)
        if (args.query.isBlank()) {
            invoke.reject("Busca vazia")
            return
        }
        executor.execute cmd@{
            ensureInitialized()
            try {
                val max = args.maxResults ?: 10
                val request = YoutubeDLRequest(buildSearchQuery(args.platform, args.query, max))
                request.addOption("--flat-playlist")
                request.addOption("--dump-json")
                request.addOption("--no-download")
                request.addOption("--no-warnings")
                request.addOption("--socket-timeout", "15")
                request.addOption("--retries", "2")
                args.proxy?.takeIf { it.isNotBlank() }?.let {
                    request.addOption("--proxy", it)
                }
                val response = YoutubeDL.getInstance().execute(request, "search-${System.nanoTime()}")
                if (response.exitCode != 0 && response.out.isBlank()) {
                    invoke.reject(cleanError(response.err.ifBlank { response.out }))
                    return@cmd
                }
                val results = JSONArray()
                response.out.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.forEach { line ->
                    try {
                        results.put(mapSearchItem(JSONObject(line)))
                    } catch (_: Exception) { /* ignora */ }
                }
                invoke.resolve(JSObject().apply { put("results", results) })
            } catch (e: Exception) {
                Log.e(TAG, "search falhou", e)
                invoke.reject(e.message ?: "Falha na busca")
            }
        }
    }

    // ---- execute: argv canônico do Rust no yt-dlp embarcado ----

    @Command
    fun execute(invoke: Invoke) {
        val args = invoke.parseArgs(ExecuteArgs::class.java)
        if (args.processId.isBlank() || args.argv.isEmpty()) {
            invoke.reject("argv ou processId inválidos")
            return
        }
        executor.execute cmd@{
            ensureInitialized()
            val startMs = System.currentTimeMillis()
            var captured: String? = null
            // Todos os destinos vistos (download + pós-processamento): o último
            // pode ser um intermediário já apagado (ex. .webm após extrair o
            // .mp3) — na conclusão procura-se o mais recente EXISTENTE.
            val seen = mutableListOf<String>()
            var lastPercent = -1
            var processingSent = false
            try {
                val request = YoutubeDLRequest(emptyList<String>())
                request.addCommands(args.argv)
                val response = YoutubeDL.getInstance().execute(request, args.processId) { _, _, line ->
                    parseDestination(line)?.let {
                        captured = it
                        seen.add(it)
                        lastPaths[args.processId] = it
                    }
                    // Pós-processamento (ffmpeg embarcado: extração MP3, merge,
                    // embed) não imprime % — sem este evento a UI congela em
                    // 100% sem explicação (o DownloadEngine já trata `processing`).
                    if (!processingSent && isPostProcessorLine(line)) {
                        processingSent = true
                        emitOnUi("yt-dlp-progress") {
                            put("id", args.processId)
                            put("type", "processing")
                        }
                        showDlProcessing(args.processId, args.title)
                    }
                    parseProgress(line)?.let { p ->
                        if (p.percent.toInt() != lastPercent) {
                            lastPercent = p.percent.toInt()
                            emitOnUi("yt-dlp-progress") {
                                put("id", args.processId)
                                put("type", "progress")
                                put("percent", p.percent)
                                put("speed", p.speed)
                                put("eta", p.eta)
                                put("downloaded", p.downloaded)
                                put("total", p.total)
                            }
                            showDlProgress(args.processId, args.title, p.percent.toInt())
                        }
                    }
                }
                if (response.exitCode != 0) {
                    val msg = cleanError(response.err.ifBlank { response.out })
                    emitOnUi("yt-dlp-progress") {
                        put("id", args.processId)
                        put("type", "error")
                        put("message", msg)
                    }
                    showDlError(args.processId, args.title, msg)
                    invoke.reject(msg)
                    return@cmd
                }
                val finalPath = seen.asReversed().firstOrNull { File(it).exists() }
                    ?: newestFile(lastPaths[args.processId])
                    // Último recurso: o arquivo pode pousar no disco depois das
                    // linhas de callback (conversão ffmpeg lenta em aparelho
                    // fraco). Deriva a pasta do `-o` do argv e aguarda até 12s
                    // por um arquivo novo não-temporário.
                    ?: waitForRecentFile(outputDirFromArgv(args.argv), startMs, 12_000)
                lastPaths.remove(args.processId)
                if (finalPath == null) {
                    // Diagnóstico: destinos vistos + conteúdo da pasta + cauda
                    // do stdout/stderr (ex. pós-processador falhou?).
                    try {
                        val dbgDir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                        val files = dbgDir?.listFiles()?.map { it.name + ":" + it.length() }?.take(20)
                        Log.w(TAG, "execute ${args.processId} sem arquivo: seen=$seen dir=${dbgDir?.absolutePath} files=$files")
                        Log.w(TAG, "execute ${args.processId} out-tail=${response.out.takeLast(600)}")
                        Log.w(TAG, "execute ${args.processId} err-tail=${response.err.takeLast(600)}")
                    } catch (_: Exception) { /* diagnóstico best-effort */ }
                    val msg = "download concluído sem arquivo final"
                    emitOnUi("yt-dlp-progress") {
                        put("id", args.processId)
                        put("type", "error")
                        put("message", msg)
                    }
                    invoke.reject(msg)
                    return@cmd
                }
                val size = File(finalPath).length()
                Log.i(TAG, "execute ${args.processId} ok: $finalPath ($size)")
                // Pasta privada do app é invisível (Files/Downloads, players):
                // publica cópia na coleção pública p/ o usuário achar o arquivo.
                // Best-effort: nunca falha o download se a publicação falhar.
                val publicUri = publishToPublicDownloads(File(finalPath), args.publicSubdir)
                val filtersNote = if (args.warnFilters)
                    "Filtros de áudio/vídeo indisponíveis no mobile — arquivo salvo sem normalização/nitidez."
                else null
                emitOnUi("yt-dlp-progress") {
                    put("id", args.processId)
                    put("type", "complete")
                    put("filePath", finalPath)
                    put("size", size)
                    if (publicUri != null) put("publicUri", publicUri)
                    if (filtersNote != null) put("subWarning", filtersNote)
                }
                showDlComplete(args.processId, args.title, File(finalPath))
                invoke.resolve(JSObject().apply {
                    put("filePath", finalPath)
                    put("size", size)
                    if (publicUri != null) put("publicUri", publicUri)
                    if (filtersNote != null) put("subWarning", filtersNote)
                })
            } catch (e: Exception) {
                Log.e(TAG, "execute ${args.processId} falhou", e)
                val msg = (e.message ?: "Falha no download").take(500)
                emitOnUi("yt-dlp-progress") {
                    put("id", args.processId)
                    put("type", "error")
                    put("message", msg)
                }
                showDlError(args.processId, args.title, msg)
                invoke.reject(msg)
            }
        }
    }

    @Command
    fun cancel(invoke: Invoke) {
        val args = invoke.parseArgs(CancelArgs::class.java)
        try {
            val killed = YoutubeDL.getInstance().destroyProcessById(args.id)
            if (args.cleanup) {
                lastPaths.remove(args.id)?.let { removeTempVariants(File(it)) }
                cancelDlNotification(args.id)
            } else {
                lastPaths.remove(args.id)
                showDlPaused(args.id, "")
            }
            invoke.resolve(JSObject().apply { put("success", killed) })
        } catch (e: Exception) {
            invoke.reject(e.message ?: "Erro ao cancelar")
        }
    }

    // ---- notificações nativas de download ----
    // O WebView não tem Notification API e o plugin JS não cobre progresso:
    // o próprio plugin emite (throttle já feito pelo % inteiro). Toque abre o
    // arquivo (concluído) ou o app (andamento). Best-effort com try/catch.

    private val dlChannelId = "linkfetcher_downloads"

    private fun dlNotifyId(processId: String): Int =
        processId.hashCode().let { if (it == Int.MIN_VALUE) 0 else kotlin.math.abs(it) }

    private fun notificationManager(): android.app.NotificationManager? = try {
        activity.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
    } catch (_: Exception) { null }

    private fun ensureDlChannel() {
        if (android.os.Build.VERSION.SDK_INT < 26) return
        try {
            val nm = notificationManager() ?: return
            if (nm.getNotificationChannel(dlChannelId) == null) {
                nm.createNotificationChannel(
                    android.app.NotificationChannel(
                        dlChannelId, "Downloads",
                        android.app.NotificationManager.IMPORTANCE_DEFAULT
                    )
                )
            }
        } catch (_: Exception) { }
    }

    private fun appLaunchPending(): android.app.PendingIntent? {
        // Corpo em bloco (não expressão): `return` antecipado não é
        // permitido em expression body.
        return try {
            val launch = activity.packageManager.getLaunchIntentForPackage(activity.packageName) ?: return null
            android.app.PendingIntent.getActivity(
                activity, 0, launch,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
        } catch (_: Exception) { null }
    }

    private fun fileViewPending(file: File): android.app.PendingIntent? {
        return try {
            val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
            val mime = MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(file.extension.lowercase()) ?: "*/*"
            val view = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mime)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(view, file.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            android.app.PendingIntent.getActivity(
                activity, file.absolutePath.hashCode(), chooser,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
        } catch (_: Exception) { null }
    }

    private fun showDlProgress(processId: String, title: String, percent: Int) {
        try {
            ensureDlChannel()
            val nm = notificationManager() ?: return
            val n = androidx.core.app.NotificationCompat.Builder(activity, dlChannelId)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(title.ifBlank { "Baixando…" })
                .setContentText("$percent%")
                .setProgress(100, percent.coerceIn(0, 100), false)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(appLaunchPending())
                .build()
            nm.notify(dlNotifyId(processId), n)
        } catch (_: Exception) { }
    }

    private fun showDlProcessing(processId: String, title: String) {
        try {
            ensureDlChannel()
            val nm = notificationManager() ?: return
            val n = androidx.core.app.NotificationCompat.Builder(activity, dlChannelId)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(title.ifBlank { "Baixando…" })
                .setContentText("Processando…")
                .setProgress(0, 0, true)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(appLaunchPending())
                .build()
            nm.notify(dlNotifyId(processId), n)
        } catch (_: Exception) { }
    }

    private fun showDlPaused(processId: String, title: String) {
        try {
            ensureDlChannel()
            val nm = notificationManager() ?: return
            val n = androidx.core.app.NotificationCompat.Builder(activity, dlChannelId)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(title.ifBlank { "Download" })
                .setContentText("Pausado")
                .setOngoing(false)
                .setOnlyAlertOnce(true)
                .setContentIntent(appLaunchPending())
                .build()
            nm.notify(dlNotifyId(processId), n)
        } catch (_: Exception) { }
    }

    private fun showDlComplete(processId: String, title: String, file: File) {
        try {
            ensureDlChannel()
            val nm = notificationManager() ?: return
            val n = androidx.core.app.NotificationCompat.Builder(activity, dlChannelId)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("Download concluído")
                .setContentText(title.ifBlank { file.name })
                .setOngoing(false)
                .setAutoCancel(true)
                .setContentIntent(fileViewPending(file) ?: appLaunchPending())
                .build()
            nm.notify(dlNotifyId(processId), n)
        } catch (_: Exception) { }
    }

    private fun showDlError(processId: String, title: String, msg: String) {
        try {
            ensureDlChannel()
            val nm = notificationManager() ?: return
            val n = androidx.core.app.NotificationCompat.Builder(activity, dlChannelId)
                .setSmallIcon(android.R.drawable.stat_notify_error)
                .setContentTitle("Falha no download")
                .setContentText((title.ifBlank { "Download" } + " · " + msg).take(140))
                .setOngoing(false)
                .setAutoCancel(true)
                .setContentIntent(appLaunchPending())
                .build()
            nm.notify(dlNotifyId(processId), n)
        } catch (_: Exception) { }
    }

    private fun cancelDlNotification(processId: String) {
        try { notificationManager()?.cancel(dlNotifyId(processId)) } catch (_: Exception) { }
    }

    // ---- arquivos ----

    // Copia o arquivo final (pasta privada do app, invisível ao usuário) para
    // a coleção pública de Downloads, onde aparece no app Files, gerenciadores
    // e players. Retorna a URI pública ou null (best-effort: o download já
    // concluiu — publicação nunca falha a operação).
    // SDK 29+: MediaStore com RELATIVE_PATH (sem permissão).
    // SDK 24-28: pasta pública + MediaScanner (precisa da permissão
    // WRITE_EXTERNAL_STORAGE, já declarada com maxSdkVersion=28).
    private fun publishToPublicDownloads(src: File, subdir: String? = null): String? {
        // Nulo (frontend antigo) = padrão "LinkFetcher". String vazia = raiz de
        // Downloads (escolha explícita do usuário). Qualquer valor suspeito é
        // sanitizado — nunca escreve fora de Downloads.
        val clean = if (subdir == null) "LinkFetcher"
        else subdir.substringAfterLast('/').trim()
            .replace(Regex("[^\\p{L}\\p{N} _.-]"), "")
            .replace(Regex("\\.+"), ".")
            .take(32).trim().trim('.')
        val relPath = if (clean.isEmpty()) Environment.DIRECTORY_DOWNLOADS
            else "${Environment.DIRECTORY_DOWNLOADS}/$clean"
        return try {
            if (android.os.Build.VERSION.SDK_INT >= 29) {
                val mime = MimeTypeMap.getSingleton()
                    .getMimeTypeFromExtension(src.extension.lowercase())
                    ?: "application/octet-stream"
                val values = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.Downloads.DISPLAY_NAME, src.name)
                    put(android.provider.MediaStore.Downloads.MIME_TYPE, mime)
                    put(
                        android.provider.MediaStore.Downloads.RELATIVE_PATH,
                        relPath
                    )
                    put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = activity.contentResolver
                val uri = resolver.insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
                ) ?: return null
                try {
                    resolver.openOutputStream(uri)?.use { out ->
                        src.inputStream().use { it.copyTo(out) }
                    } ?: return null
                    values.clear()
                    values.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
                    resolver.update(uri, values, null, null)
                } catch (e: Exception) {
                    try { resolver.delete(uri, null, null) } catch (_: Exception) { }
                    throw e
                }
                Log.i(TAG, "publicado em $relPath: $uri")
                uri.toString()
            } else {
                val pub = if (clean.isEmpty()) Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOWNLOADS
                ) else File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    clean
                )
                if (!pub.exists() && !pub.mkdirs()) return null
                val dst = File(pub, src.name)
                src.inputStream().use { input ->
                    dst.outputStream().use { input.copyTo(it) }
                }
                android.media.MediaScannerConnection.scanFile(
                    activity, arrayOf(dst.absolutePath), null, null
                )
                Log.i(TAG, "publicado (legado): ${dst.absolutePath}")
                dst.absolutePath
            }
        } catch (e: Exception) {
            Log.w(TAG, "publish falhou (best-effort): ${e.message}")
            null
        }
    }

    @Command
    fun getDownloadsDir(invoke: Invoke) {
        try {
            val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: activity.filesDir
            if (!dir.exists()) dir.mkdirs()
            invoke.resolve(JSObject().apply { put("dir", dir.absolutePath) })
        } catch (e: Exception) {
            invoke.reject(e.message ?: "Sem acesso ao armazenamento")
        }
    }

    @Command
    fun openFile(invoke: Invoke) {
        val args = invoke.parseArgs(OpenArgs::class.java)
        val file = File(args.path.trim().trim('\'', '"'))
        if (!file.exists()) {
            Log.e(TAG, "openFile: não existe: ${args.path}")
            invoke.reject("arquivo não encontrado")
            return
        }
        try {
            val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
            val mime = MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(file.extension.lowercase())
                ?: "*/*"
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mime)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            // Sem app tratador o chooser lança: vira reject com mensagem real
            // (o frontend exibe no toast) em vez de silêncio.
            if (intent.resolveActivity(activity.packageManager) == null) {
                Log.e(TAG, "openFile: sem app para $mime (${file.name})")
                invoke.reject("Nenhum app para abrir .$mime")
                return
            }
            activity.startActivity(Intent.createChooser(intent, file.name))
            Log.i(TAG, "openFile ok: ${file.absolutePath} ($mime)")
            invoke.resolve(JSObject())
        } catch (e: Exception) {
            Log.e(TAG, "openFile falhou: ${file.absolutePath}", e)
            invoke.reject(e.message ?: "Nenhum app para abrir o arquivo")
        }
    }

    // ---- helpers ----

    private data class MobileProgress(
        val percent: Double,
        val speed: Double,
        val eta: Double,
        val downloaded: Long,
        val total: Long
    )

    // `at` aceita "Unknown speed" (2 tokens): sem o grupo guloso a linha era
    // descartada e o progresso congelava nesses trechos.
    private val progressRegex =
        """\[download\]\s+(NA|\d+(?:\.\d+)?)%\s+of\s+(~?\S+)\s+at\s+(.+?)\s+ETA\s+(\S+)""".toRegex()

    private fun parseSize(s: String): Long {
        val t = s.trim().trimStart('~')
        fun num(suffix: String, mult: Long): Long? =
            t.takeIf { it.endsWith(suffix) }?.dropLast(suffix.length)
                ?.toDoubleOrNull()?.let { (it * mult).toLong() }
        return num("GiB", 1024L * 1024 * 1024)
            ?: num("MiB", 1024L * 1024)
            ?: num("KiB", 1024L)
            ?: num("B", 1)
            ?: t.toDoubleOrNull()?.toLong()
            ?: 0L
    }

    private fun parseSpeed(s: String): Double {
        val t = s.trim()
        if (t == "NA" || t == "Unknown" || t == "Unknown speed") return 0.0
        fun num(suffix: String, mult: Double): Double? =
            t.takeIf { it.endsWith(suffix) }?.dropLast(suffix.length)
                ?.toDoubleOrNull()?.let { it * mult }
        return num("GiB/s", 1024.0 * 1024 * 1024)
            ?: num("MiB/s", 1024.0 * 1024)
            ?: num("KiB/s", 1024.0)
            ?: num("B/s", 1.0)
            ?: t.toDoubleOrNull()
            ?: 0.0
    }

    private fun parseEta(s: String): Double {
        val parts = s.trim().split(':')
        var total = 0.0
        for (p in parts) {
            total = total * 60.0 + (p.toDoubleOrNull() ?: return 0.0)
        }
        return total
    }

    private fun parseProgress(line: String): MobileProgress? {
        val m = progressRegex.find(line.trim()) ?: return null
        // Percentual desconhecido ("NA"): sem base para % — ignora a linha.
        val percent = m.groupValues[1].toDoubleOrNull() ?: return null
        val total = parseSize(m.groupValues[2])
        val downloaded = (percent / 100.0 * total).toLong()
        return MobileProgress(
            percent,
            parseSpeed(m.groupValues[3]),
            parseEta(m.groupValues[4]),
            downloaded,
            total
        )
    }

    private fun parseDestination(line: String): String? {
        val t = line.trim()
        val dest = "Destination: "
        val di = t.indexOf(dest)
        if (di >= 0) return t.substring(di + dest.length).trim()
        val mergePrefix = "Merging formats into \""
        val mi = t.indexOf(mergePrefix)
        if (mi >= 0) {
            val rest = t.substring(mi + mergePrefix.length)
            val end = rest.indexOf('"')
            if (end > 0) return rest.substring(0, end)
        }
        val marker = " has already been downloaded"
        val ai = t.indexOf(marker)
        if (ai >= 0) {
            val di2 = t.indexOf("[download] ")
            if (di2 >= 0) return t.substring(di2 + "[download] ".length, ai).trim()
        }
        return null
    }

    private fun isPostProcessorLine(line: String): Boolean {
        val t = line.trim()
        return t.startsWith("[ExtractAudio]")
            || t.startsWith("[Merger]")
            || t.startsWith("[VideoConvertor]")
            || t.startsWith("[VideoRemuxer]")
            || t.startsWith("[EmbedSubtitle]")
            || t.startsWith("[Metadata]")
            || t.startsWith("[ThumbnailsConvertor]")
    }

    private fun newestFile(known: String?): String? {
        known?.takeIf { File(it).exists() }?.let { return it }
        val dir = try {
            activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return null
        } catch (_: Exception) {
            return null
        }
        return dir.listFiles()
            ?.filter { f -> f.isFile && !isTempArtifact(f.name) && !isSidecar(f.name) }
            ?.maxByOrNull { it.lastModified() }
            ?.absolutePath
    }

    private fun isTempArtifact(name: String): Boolean {
        return name.contains(".part") || name.endsWith(".ytdl") || name.endsWith(".temp") ||
            name.endsWith(".tmp") || name.endsWith(".new") || name.contains(".cuttmp.") ||
            name.endsWith(".cuttmp") || name.contains("-Frag")
    }

    // Sidecars (legenda/capa/metadados) nunca são o arquivo final: sem este
    // filtro o fallback podia devolver um .vtt/.jpg como "download concluído".
    private fun isSidecar(name: String): Boolean {
        val n = name.lowercase()
        return n.endsWith(".vtt") || n.endsWith(".srt") || n.endsWith(".ass") ||
            n.endsWith(".lrc") || n.endsWith(".srv1") || n.endsWith(".srv2") ||
            n.endsWith(".ttml") || n.endsWith(".description") ||
            n.endsWith(".info.json") || n.endsWith(".annotations.xml")
    }

    // Pasta de saída a partir do `-o` do argv (`/dir/nome.%(ext)s` → `/dir`).
    private fun outputDirFromArgv(argv: List<String>): File? {
        val i = argv.indexOf("-o")
        if (i < 0 || i + 1 >= argv.size) return null
        val tpl = argv[i + 1]
        val cut = tpl.indexOf("%(").takeIf { it >= 0 } ?: tpl.length
        return File(tpl.substring(0, cut)).parentFile?.takeIf { it.isDirectory }
    }

    // Aguarda (poll 500ms) um arquivo novo não-temporário na pasta — cobre o
    // caso em que o mp3 Convertido pousa depois do retorno das callbacks.
    private fun waitForRecentFile(dir: File?, sinceMs: Long, timeoutMs: Long): String? {
        if (dir == null) return null
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val best = dir.listFiles()
                ?.filter { f -> f.isFile && !isTempArtifact(f.name) && !isSidecar(f.name) && f.lastModified() >= sinceMs && f.length() > 0 }
                ?.maxByOrNull { it.lastModified() }
            if (best != null) return best.absolutePath
            try {
                Thread.sleep(500)
            } catch (_: InterruptedException) {
                break
            }
        }
        return null
    }

    private fun removeTempVariants(base: File): Int {
        var removed = 0
        if (isTempArtifact(base.name) && base.delete()) removed++
        for (suffix in listOf(".part", ".ytdl", ".temp", ".tmp", ".new")) {
            if (File(base.absolutePath + suffix).delete()) removed++
        }
        base.parentFile?.listFiles()?.forEach { f ->
            if (f.name.startsWith(base.name) && f.name.length > base.name.length &&
                (f.name.contains(".cuttmp.") || f.name.contains("-Frag")) && f.delete()
            ) removed++
        }
        return removed
    }

    private fun cleanError(stderr: String): String {
        fun isNoise(l: String): Boolean {
            val t = l.trim()
            if (t.isEmpty()) return true
            return (t.contains("frame=") && t.contains("fps=")) ||
                (t.startsWith("size=") && t.contains("time=")) ||
                (t.contains("bitrate=") && t.contains("speed=")) ||
                t.startsWith("elapsed=") ||
                progressRegex.containsMatchIn(t)
        }
        val kept = stderr.split('\n', '\r').map { it.trim() }.filter { !isNoise(it) }
        var msg = kept.takeLast(8).joinToString(" · ").trim()
        if (msg.isEmpty()) {
            msg = stderr.split('\n', '\r').map { it.trim() }
                .filter { it.isNotEmpty() }.lastOrNull() ?: "erro desconhecido"
        }
        for (prefix in listOf("ERROR: ", "Error: ")) {
            if (msg.startsWith(prefix)) {
                msg = msg.removePrefix(prefix)
                break
            }
        }
        return if (msg.length > 500) msg.take(497) + "..." else msg
    }

    private fun buildSearchQuery(platform: String, query: String, max: Int): String {
        fun enc(s: String): String {
            val sb = StringBuilder()
            for (b in s.toByteArray(Charsets.UTF_8)) {
                val c = b.toInt() and 0xFF
                if (c in 0x30..0x39 || c in 0x41..0x5A || c in 0x61..0x7A || c == '-'.code || c == '_'.code ||
                    c == '.'.code || c == '!'.code || c == '~'.code || c == '*'.code || c == '\''.code ||
                    c == '('.code || c == ')'.code
                ) sb.append(c.toChar()) else sb.append('%').append(String.format("%02X", c))
            }
            return sb.toString()
        }
        return when (platform) {
            "youtube" -> "ytsearch$max:$query"
            "vimeo" -> "https://vimeo.com/search?q=${enc(query)}"
            "dailymotion" -> "https://www.dailymotion.com/search/${enc(query)}/videos"
            "bilibili" -> "https://search.bilibili.com/all?keyword=${enc(query)}"
            "soundcloud" -> "scsearch$max:$query"
            else -> "ytsearch$max:$query"
        }
    }

    private fun mapSearchItem(item: JSONObject): JSONObject {
        fun str(vararg keys: String): String {
            for (k in keys) {
                val v = item.optString(k, "")
                if (v.isNotEmpty()) return v
            }
            return ""
        }
        var thumbnail = str("thumbnail")
        if (thumbnail.isEmpty()) {
            val thumbs = item.optJSONArray("thumbnails")
            if (thumbs != null && thumbs.length() > 0) {
                thumbnail = thumbs.optJSONObject(0)?.optString("url", "") ?: ""
            }
        }
        val out = JSObject()
        out.put("id", str("id"))
        val title = str("title")
        out.put("title", title.ifEmpty { "Unknown" })
        out.put("url", str("url", "webpage_url"))
        out.put("thumbnail", thumbnail)
        out.put("duration", item.optDouble("duration", 0.0))
        out.put("duration_string", str("duration_string").ifEmpty { "0:00" })
        out.put("view_count", item.optLong("view_count", 0L))
        out.put("uploader", str("uploader", "channel"))
        out.put("description", str("description"))
        return out
    }
}
