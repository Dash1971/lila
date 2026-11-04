package lila.web
package ui

import lila.core.config.BaseUrl
import lila.ui.*
import lila.ui.ScalatagsTemplate.*

def openGraph(graph: OpenGraph): List[Frag] =
  import graph.*
  val property = attr("property")
  def tag(name: String, value: String) =
    meta(
      property := s"og:$name",
      content := value
    )
  List(
    "title" -> title,
    "description" -> description,
    "url" -> url.value,
    "type" -> `type`,
    "site_name" -> siteName
  ).map(tag) ::: image.map(i => tag("image", i.value)).toList

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
