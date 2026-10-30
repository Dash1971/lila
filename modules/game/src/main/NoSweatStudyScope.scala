package lila.game

/** Explicit study mode is bound to one known deployment/database pair. */
object NoSweatStudyScope:
  def valid(run: String, main: String, yolo: String, domain: String, publicRatings: Boolean): Boolean =
    val expected = if publicRatings then "mongodb://127.0.0.1:27019/nosweat"
    else s"mongodb://127.0.0.1:27028/nosweat_calibration_$run"
    val host = if publicRatings then "mutechess.org" else "127.0.0.1:19763"
    run.matches("[a-z][a-z0-9_]{2,31}") && domain == host &&
    main.takeWhile(_ != '?') == expected && yolo.takeWhile(_ != '?') == expected
