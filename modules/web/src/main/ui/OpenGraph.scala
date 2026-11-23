package lila.web
package ui

import play.api.i18n.Lang

import lila.core.config.BaseUrl
import lila.ui.*
import lila.ui.ScalatagsTemplate.*

object OpenGraph:

  private val property = attr("property")

  private def tag(name: String, value: String) =
    meta(property := name, content := value)

  private def ogTag(name: String, value: String) =
    tag(s"og:$name", value)

  def render(graph: OpenGraph)(using lang: Lang): List[Frag] =
    import graph.*
    List(
      "title" -> title,
      "description" -> description,
      "url" -> url.value,
      "type" -> `type`,
      "site_name" -> siteName,
      "locale" -> lang.code
    ).map(ogTag) :::
      image.map(i => ogTag("image", i.value)).toList :::
      extra.map(tag)

// Apply only from the focused Mute Chess page renderer, retaining page-specific previews.
def muteChessOpenGraph(graph: OpenGraph, baseUrl: BaseUrl, image: Url, upstreamImage: Url): OpenGraph =
  val preview = graph.image.filterNot(_ == upstreamImage).getOrElse(image)
  graph.copy(
    siteName = "mutechess.org",
    image = Some(
      if preview.value.startsWith("/") && !preview.value.startsWith("//") then
        Url(s"${baseUrl.value.stripSuffix("/")}${preview.value}")
      else preview
    )
  )
