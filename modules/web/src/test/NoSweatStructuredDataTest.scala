package lila.web

import play.api.libs.json.Json

class NoSweatStructuredDataTest extends munit.FunSuite:
  test("structured metadata cannot close its script element and inject executable markup"):
    val attack = "</script><script id=structured-data-probe>alert(1)</script>"
    val html = lila.ui.bits.structuredData("BlogPosting")(Json.obj("description" -> attack)).render
    assertEquals("<script".r.findAllIn(html).length, 1)
    assertEquals("</script>".r.findAllIn(html).length, 1)
    assert(!html.contains("<script id=structured-data-probe>"), html)
    assert(html.contains("structured-data-probe"), html)

  test("ordinary organization metadata retains its wrapper and content"):
    val html = lila.ui.bits
      .structuredData("Organization")(Json.obj("name" -> "Mute Chess", "url" -> "https://mutechess.org"))
      .render
    assert(html.startsWith("<script type=\"application/ld+json\">"), html)
    assert(html.endsWith("</script>"), html)
    assert(html.contains("Mute Chess"), html)
    assert(html.contains("https://mutechess.org"), html)
