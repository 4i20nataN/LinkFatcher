package com.linkfetcher.app

import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.ffmpeg.FFmpeg

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    try {
      YoutubeDL.getInstance().init(this)
      FFmpeg.getInstance().init(this)
      Log.i("LinkFetcher", "YoutubeDL e FFmpeg inicializados com sucesso no Android")
    } catch (e: Exception) {
      Log.e("LinkFetcher", "Falha ao inicializar YoutubeDL/FFmpeg", e)
    }
  }
}
