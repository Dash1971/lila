package lila.web

import lila.core.config.{ BaseUrl, NetConfig, NetDomain, RateLimit }
import lila.core.data.Url
import lila.core.email.EmailAddress
import lila.ui.OpenGraph

class NoSweatBrandingTest extends munit.FunSuite:
  private val origin = BaseUrl("https://mutechess.org")
  private val image = Url("https://mutechess.org/assets/nosweat/social.png")
  private val upstreamImage = Url("https://mutechess.org/assets/logo/lichess-tile-wide.png")

  test("shared homepage, profile and analysis previews identify Mute Chess and replace fallback artwork"):
    for (path, oldImage) <- List(
        "/" -> Some(image),
        "/@/player" -> Some(upstreamImage),
        "/analysis" -> None
      )
    do
      val original = OpenGraph("A & B", "Page description", Url(s"${origin.value}$path"), image = oldImage)
      val branded = ui.muteChessOpenGraph(original, origin, image, upstreamImage)
      val html = ui.OpenGraph.render(branded).map(_.render).mkString
      assert(html.contains("property=\"og:site_name\" content=\"mutechess.org\""))
      assert(html.contains(s"property=\"og:image\" content=\"${image.value}\""))
      assert(html.contains("A &amp; B"))
      assertEquals(branded.url, original.url)
      assertEquals(branded.description, original.description)
      assertEquals(original.siteName, "lichess.org")
      assert(!html.contains("lichess.org"))

  test("game and puzzle preview positions remain intact with absolute image URLs"):
    for path <- List("/game/export/png/abcdefgh.png", "/training/export/png/12345.png") do
      val original =
        OpenGraph("Position", "Position description", Url(s"${origin.value}$path"), image = Some(Url(path)))
      val branded = ui.muteChessOpenGraph(original, BaseUrl(origin.value + "/"), image, upstreamImage)
      assertEquals(branded.image, Some(Url(origin.value + path)))
      val external = original.copy(image = Some(Url("https://example.org/position.png")))
      assertEquals(ui.muteChessOpenGraph(external, origin, image, upstreamImage).image, external.image)

  test("native Open Graph rendering keeps its original upstream identity unless explicitly branded"):
    val original = OpenGraph("Native page", "Description", Url("https://lichess.org/analysis"))
    assert(ui.OpenGraph.render(original).map(_.render).mkString.contains("content=\"lichess.org\""))

  private def staticContent(site: String, domain: String) = new StaticContent(
    NetConfig(
      domain = NetDomain(domain),
      prodDomain = NetDomain(domain),
      baseUrl = BaseUrl(s"https://$domain"),
      stageBanner = false,
      siteName = site,
      crawlable = true,
      rateLimit = RateLimit(false),
      email = EmailAddress("unused@example.org"),
      logRequests = false
    )
  )

  test("Mute organization metadata never inherits Lichess legal identifiers or social accounts"):
    val branded = staticContent("Mute Chess", "mutechess.org").organizationScript.map(_.render).getOrElse("")
    assert(branded.contains("Mute Chess"))
    assert(branded.contains("https://github.com/Dash1971/mute-chess"))
    for inherited <- List("lichess.org", "LICHESS", "legalName", "taxID", "iso6523Code", "foundingDate") do
      assert(!branded.contains(inherited), inherited)
    val upstream = staticContent("lichess.org", "lichess.org").organizationScript.map(_.render).getOrElse("")
    assert(upstream.contains("LICHESS.ORG"))
    assert(upstream.contains("830378717"))
