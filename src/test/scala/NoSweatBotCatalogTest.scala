package lila.app

import play.api.libs.json.*
import lila.core.perf.PerfKey

class NoSweatBotCatalogTest extends munit.FunSuite:
  private val legacy = Json.obj(
    "id" -> "legacy",
    "username" -> "SignalTrain001",
    "ratings" -> Json.obj(
      "blitz" -> Json.obj("initial_rating" -> 1500, "initial_rd" -> 200),
      "rapid" -> Json.obj("initial_rating" -> 1550, "initial_rd" -> 300)
    )
  )
  private val catalog = Json.obj(
    "id" -> "catalog-one",
    "username" -> "CatalogOne",
    "name" -> "Catalog One",
    "rating_assignment" -> Json.obj("schema" -> 1, "method" -> "research", "gameCount" -> 0),
    "ratings" -> JsObject(NoSweatBotCatalog.speeds.zipWithIndex.map: (speed, i) =>
      speed.value -> Json.obj("initial_rating" -> (1600 + i * 25), "initial_rd" -> 100))
  )

  test("the entire roster rejects duplicate IDs and case-insensitive usernames before initialization"):
    assertEquals(NoSweatBotCatalog.validate(List(legacy, catalog)), List(legacy, catalog))
    assertEquals(NoSweatBotCatalog.publicName(catalog, Map.empty), Some("Catalog One"))
    intercept[IllegalArgumentException]:
      NoSweatBotCatalog.validate(List(legacy, legacy ++ Json.obj("username" -> "OtherName")))
    intercept[IllegalArgumentException]:
      NoSweatBotCatalog.validate(
        List(legacy, legacy ++ Json.obj("id" -> "other", "username" -> "signaltrain001"))
      )

  test("assigned priors preserve zero games and use native nonprovisional Glicko"):
    NoSweatBotCatalog.speeds.zipWithIndex.foreach: (speed, i) =>
      val perf = NoSweatBotCatalog.seededPerf(catalog, speed)
      assertEquals(perf.nb, 0)
      assertEquals(perf.recent, Nil)
      assert(perf.latest.isDefined)
      assert(perf.nonEmpty)
      assertEquals(perf.intRating.value, 1600 + i * 25)
      assertEquals(perf.glicko.deviation, 100d)
      assert(perf.provisional.no)
      val player = lila.game.Player.make(chess.White, UserId("catalogone") -> perf)
      assertEquals(player.rating.map(_.value), Some(1600 + i * 25))
      assert(player.provisional.no)

  test("legacy speed fallbacks remain unchanged while explicit catalog speed priors are retained"):
    assertEquals(NoSweatBotCatalog.seededPerf(legacy, PerfKey.bullet).intRating.value, 1500)
    assertEquals(NoSweatBotCatalog.seededPerf(legacy, PerfKey.classical).intRating.value, 1550)
    assertEquals(NoSweatBotCatalog.seededPerf(legacy, PerfKey.bullet).glicko.deviation, 200d)
    assertEquals(NoSweatBotCatalog.seededPerf(legacy, PerfKey.classical).glicko.deviation, 300d)
    assertEquals(NoSweatBotCatalog.seededPerf(catalog, PerfKey.bullet).intRating.value, 1625)

  test("a catalog entry cannot adopt another existing account even if the account was a managed bot"):
    assertEquals(NoSweatBotCatalog.initialIdentity(legacy), None)
    assertEquals(NoSweatBotCatalog.initialIdentity(catalog), Some("catalog-one"))
    assert(NoSweatBotCatalog.reusable(catalog, false, None))
    // A restart after creation, before perf seeding, sees the insert's identity marker.
    assert(NoSweatBotCatalog.reusable(catalog, true, NoSweatBotCatalog.initialIdentity(catalog)))
    assert(NoSweatBotCatalog.reusable(catalog, true, Some("catalog-one")))
    assert(!NoSweatBotCatalog.reusable(catalog, true, None))
    assert(!NoSweatBotCatalog.reusable(catalog, true, Some("different")))
    assert(NoSweatBotCatalog.reusable(legacy, true, None))

  test("catalog priors require all six explicit speeds and the reviewed initial deviation"):
    intercept[IllegalArgumentException]:
      NoSweatBotCatalog.validate(
        List(
          legacy ++ Json.obj(
            "name" -> "Legacy",
            "rating_assignment" -> Json.obj("schema" -> 1, "gameCount" -> 0)
          )
        )
      )
    val wrong = catalog ++ Json.obj(
      "ratings" -> (catalog \ "ratings")
        .as[JsObject]
        .deepMerge(Json.obj("blitz" -> Json.obj("initial_rd" -> 300)))
    )
    intercept[IllegalArgumentException](NoSweatBotCatalog.validate(List(wrong)))

  test("public aliases are restricted to managed placeholder names and cannot overwrite a chosen name"):
    assertEquals(
      NoSweatBotCatalog.aliases(Map("SignalTrain001" -> "Roy Batty"), List(legacy)),
      Map("signaltrain001" -> "Roy Batty")
    )
    intercept[IllegalArgumentException]:
      NoSweatBotCatalog.aliases(Map("CatalogOne" -> "Roy Batty"), List(catalog))
    intercept[IllegalArgumentException]:
      NoSweatBotCatalog.aliases(Map("SignalTrain001" -> "x" * 21), List(legacy))
    assert(NoSweatBotCatalog.aliasEligible(None, "SignalTrain001", "Roy Batty"))
    assert(NoSweatBotCatalog.aliasEligible(Some("SignalTrain001"), "SignalTrain001", "Roy Batty"))
    assert(NoSweatBotCatalog.aliasEligible(Some("Roy Batty"), "SignalTrain001", "Roy Batty"))
    assert(!NoSweatBotCatalog.aliasEligible(Some("ChosenName"), "SignalTrain001", "Roy Batty"))

  test("Wintermute always receives the owner's fixed Circuit Knight flair"):
    val wintermute = Json.obj("username" -> "Wintermute")
    assertEquals(NoSweatBotCatalog.chooseFlair(wintermute, Map.empty), "symbols.mute-circuit-knight")

  test("named sci-fi identities and aliases are assigned only original cyberpunk flairs"):
    val featured = List(
      Json.obj("username" -> "Pris", "homage" -> "Blade Runner"),
      Json.obj("username" -> "HAL9000", "name_reference" -> "2001: A Space Odyssey"),
      Json.obj("username" -> "SignalTrain084")
    )
    val aliases = Map("signaltrain084" -> "Roy Batty")
    for bot <- featured do
      assert(NoSweatBotCatalog.featuredFlair(bot, aliases))
      assert(NoSweatBotCatalog.customFlairs.contains(NoSweatBotCatalog.chooseFlair(bot, aliases)))
    assert(
      !NoSweatBotCatalog.featuredFlair(
        Json.obj("username" -> "ordinary", "rating_assignment" -> Json.obj()),
        aliases
      )
    )
