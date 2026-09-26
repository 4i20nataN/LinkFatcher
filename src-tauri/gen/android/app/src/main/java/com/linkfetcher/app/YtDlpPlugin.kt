package com.linkfetcher.app

import android.app.Activity
import android.os.Environment
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import java.io.File
import java.util.concurrent.Executors

@InvokeArg
class ProbeArgs {
    var url: String = ""
}

@InvokeArg
class DownloadArgs {
    var id: String = ""
    var url: String = ""
    var format: String? = null
    var outDir: String? = null
}

@InvokeArg
class CancelArgs {
    var id: String = ""
}

@TauriPlugin
class YtDlpPlugin(private val activity: Activity) : Plugin(activity) {

    private val executor = Executors.newCachedThreadPool()

    @Command
    fun probe(invoke: Invoke) {
        val args = invoke.parseArgs(ProbeArgs::class.java)
        if (args.url.isBlank()) {
            invoke.reject("URL vazia")
            return
        }

        executor.execute {
            try {
                val request = YoutubeDLRequest(args.url)
                request.addOption("--dump-json")
                request.addOption("--no-playlist")
                val streamInfo = YoutubeDL.getInstance().getInfo(request)
                
                val ret = JSObject()
                ret.put("title", streamInfo.title ?: "")
                ret.put("duration", streamInfo.duration)
                ret.put("uploader", streamInfo.uploader ?: "")
                ret.put("url", streamInfo.url ?: args.url)
                ret.put("ext", streamInfo.ext ?: "mp4")
                invoke.resolve(ret)
            } catch (e: Exception) {
                Log.e("YtDlpPlugin", "Erro ao executar probe", e)
                invoke.reject(e.message ?: "Erro desconhecido ao obter metadados")
            }
        }
    }

    @Command
    fun download(invoke: Invoke) {
        val args = invoke.parseArgs(DownloadArgs::class.java)
        if (args.url.isBlank() || args.id.isBlank()) {
            invoke.reject("ID ou URL inválidos")
            return
        }

        executor.execute {
            val destDir = if (!args.outDir.isNullOrBlank()) {
                File(args.outDir!!)
            } else {
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            }

            if (!destDir.exists()) {
                destDir.mkdirs()
            }

            val targetTemplate = File(destDir, "%(title)s.%(ext)s").absolutePath
            val request = YoutubeDLRequest(args.url)
            request.addOption("-o", targetTemplate)
            if (!args.format.isNullOrBlank()) {
                request.addOption("-f", args.format!!)
            }

            try {
                val response = YoutubeDL.getInstance().execute(request, args.id) { progress, etaInSeconds, line ->
                    val eventData = JSObject()
                    eventData.put("id", args.id)
                    eventData.put("type", "progress")
                    eventData.put("percent", progress.toInt())
                    eventData.put("eta", etaInSeconds.toString())
                    eventData.put("speed", "")
                    eventData.put("downloaded", 0)
                    eventData.put("total", 0)
                    trigger("yt-dlp-progress", eventData)
                }

                val completeData = JSObject()
                completeData.put("id", args.id)
                completeData.put("type", "complete")
                completeData.put("path", destDir.absolutePath)
                trigger("yt-dlp-progress", completeData)

                val ret = JSObject()
                ret.put("success", true)
                ret.put("id", args.id)
                ret.put("path", destDir.absolutePath)
                invoke.resolve(ret)
            } catch (e: Exception) {
                Log.e("YtDlpPlugin", "Erro ao executar download ${args.id}", e)
                val errorData = JSObject()
                errorData.put("id", args.id)
                errorData.put("type", "error")
                errorData.put("error", e.message ?: "Falha no download")
                trigger("yt-dlp-progress", errorData)
                invoke.reject(e.message ?: "Falha no download nativo")
            }
        }
    }

    @Command
    fun cancel(invoke: Invoke) {
        val args = invoke.parseArgs(CancelArgs::class.java)
        try {
            val killed = YoutubeDL.getInstance().destroyProcessById(args.id)
            val ret = JSObject()
            ret.put("success", killed)
            invoke.resolve(ret)
        } catch (e: Exception) {
            invoke.reject(e.message ?: "Erro ao cancelar")
        }
    }
}
