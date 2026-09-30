package com.linkfetcher.app

import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDL.UpdateChannel
import com.yausername.ffmpeg.FFmpeg
import java.util.concurrent.Executors

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    try {
      YoutubeDL.getInstance().init(applicationContext)
      FFmpeg.getInstance().init(applicationContext)
      Log.i("LinkFetcher", "YoutubeDL e FFmpeg inicializados com sucesso no Android")
      // yt-dlp embarcado envelhece rápido (quebra extração): atualiza em
      // background, sem travar a UI; falha de rede só mantém o embarcado.
      val appContext = applicationContext
      Executors.newSingleThreadExecutor().execute {
        try {
          val status = YoutubeDL.getInstance().updateYoutubeDL(appContext, UpdateChannel.STABLE)
          Log.i("LinkFetcher", "yt-dlp update: $status (${YoutubeDL.getInstance().version(appContext)})")
        } catch (t: Throwable) {
          // Throwable: no 1º boot o update troca o env em uso e pode derrubar
          // o processo (observado uma vez); nunca pode matar o app.
          Log.w("LinkFetcher", "yt-dlp update falhou (mantendo embarcado)", t)
        }
      }
    } catch (e: Throwable) {
      // Throwable (não Exception): falha de init do Python vem como Error
      // (ExceptionInInitializerError) — sem isso o boot release morre.
      Log.e("LinkFetcher", "Falha ao inicializar YoutubeDL/FFmpeg", e)
    }
  }
}
