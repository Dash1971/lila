package lila.web

import play.api.libs.json.Json
import scalatags.Text.RawFrag
import lila.common.Json.given
import lila.core.config.NetConfig

private[web] object NoSweatStaticContent:
  def organizationScript(net: NetConfig): Option[RawFrag] =
    if net.siteName.startsWith("Mute Chess") || net.siteName.startsWith("MuteChess") ||
      net.siteName.startsWith("No Sweat Chess") || net.domain.value == "mutechess.org"
    then
      Some(lila.ui.bits.structuredData("Organization"):
        Json.obj(
          "url" -> net.baseUrl,
          "name" -> "Mute Chess",
          "logo" -> s"${net.baseUrl.value.stripSuffix("/")}/assets/nosweat/icon.svg",
          "sameAs" -> List("https://github.com/Dash1971/mute-chess")
        ))
    else None
