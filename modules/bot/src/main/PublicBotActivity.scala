package lila.bot

import lila.core.perf.PerfKey

/** Product limits for public spectator activity; ordinary admission shares this ceiling. */
object PublicBotActivity:
  val capacity = 20
  val target = 5
  def canAdmit(paused: Boolean, automaticGames: Int, totalGames: Int): Boolean =
    !paused && automaticGames < target && totalGames < target
  def speed(admitted: Long): PerfKey = if admitted % 2 == 0 then PerfKey.blitz else PerfKey.rapid
