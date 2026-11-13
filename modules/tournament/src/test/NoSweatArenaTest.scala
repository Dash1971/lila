package lila.tournament

class NoSweatArenaTest extends munit.FunSuite:
  val ranked = (1 to 10).map(i => UserId(s"bot$i")).toList
  test("human participation is unlimited and bots only fill a target of ten"):
    for humans <- List(0, 1, 3, 9, 10, 15) do
      assertEquals(
        NoSweatArena.selectBots(ranked, humans, Set.empty),
        ranked.take((10 - humans).max(0)).toSet
      )
  test("lowest-standing bots leave first and leading bots return first"):
    val standings = ranked.reverse
    assertEquals(NoSweatArena.selectBots(standings, 7, Set.empty), standings.take(3).toSet)
    assertEquals(NoSweatArena.selectBots(standings, 6, Set.empty), standings.take(4).toSet)
  test("retiring bots finish their games before replacement seats are filled"):
    val retiring = ranked.takeRight(4).toSet
    assertEquals(NoSweatArena.selectBots(ranked, 5, retiring), ranked.take(1).toSet)
    assertEquals(NoSweatArena.selectBots(ranked, 5, Set.empty), ranked.take(5).toSet)
  test("an influx of humans never requires interrupting a bot game"):
    val playing = ranked.toSet
    assertEquals(NoSweatArena.selectBots(ranked, 15, playing), Set.empty[UserId])
    assertEquals(NoSweatArena.selectBots(ranked, 1, playing), ranked.take(9).toSet)
  test("a participant allowance does not change native in-game clocks"):
    assertEquals(NoSweatArena.reconnectMillis, 60000L)
  test("spectators and future registrations do not count; reconnect grace counts only active members"):
    val human = UserId("human")
    val spectator = UserId("spectator")
    val now = 100000L
    assertEquals(
      NoSweatArena.recentHumans(Set(human), Set(spectator), Map.empty, now),
      Map.empty[UserId, Long]
    )
    val seen = NoSweatArena.recentHumans(Set(human), Set(human), Map.empty, now)
    assertEquals(NoSweatArena.recentHumans(Set(human), Set.empty, seen, now + 59000).keySet, Set(human))
    assertEquals(NoSweatArena.recentHumans(Set(human), Set.empty, seen, now + 61000), Map.empty[UserId, Long])
    assertEquals(NoSweatArena.recentHumans(Set.empty, Set.empty, seen, now + 1000), Map.empty[UserId, Long])
    assertEquals(NoSweatArena.recentHumans(Set(human), Set(human), seen, now + 61000)(human), now + 61000)

  test("custom targets determine filler seats without limiting human participation"):
    for target <- List(1, 4, 12, 20); humans <- List(0, 1, 3, 10, 25) do
      assertEquals(
        NoSweatArena.selectBots(ranked, humans, Set.empty, target),
        ranked.take((target - humans).max(0)).toSet
      )
    assertEquals(NoSweatArena.selectBots(ranked, 0, Set.empty, 0), Set.empty[UserId])

  test("bot form validates range order, participant limits and rating bounds"):
    val form = play.api.data.Form(NoSweatArenaSettings.formMapping)
    def bind(min: Int, max: Int, target: Int) =
      form.bind(Map("minRating" -> min.toString, "maxRating" -> max.toString, "target" -> target.toString))
    assertEquals(bind(1400, 1700, 10).get, NoSweatArenaSettings.default)
    assertEquals(bind(1600, 1600, 4).get, NoSweatArenaSettings(1600, 1600, 4))
    assert(bind(1700, 1400, 10).errors.exists(_.message == "muteArenaRangeInvalid"))
    for (min, max, target) <- List((399, 1700, 10), (1400, 3201, 10), (1400, 1700, 0), (1400, 1700, 21)) do
      assert(bind(min, max, target).hasErrors)

  test("per-event settings survive native BSON round trips; old events receive the defaults"):
    import BSONHandlers.given
    import lila.db.dsl.{ *, given }
    val tour = Tournament(
      id = TourId("settings"),
      name = "Settings",
      status = lila.core.tournament.Status.created,
      clock = chess.Clock.Config(chess.Clock.LimitSeconds(900), chess.Clock.IncrementSeconds(10)),
      minutes = 120,
      variant = chess.variant.Standard,
      position = None,
      rated = chess.Rated.Yes,
      conditions = TournamentCondition.All.empty,
      schedule = None,
      nbPlayers = 0,
      createdAt = nowInstant,
      createdBy = UserId("owner"),
      startsAt = nowInstant,
      noSweatArena = Some(NoSweatArenaSettings(1300, 1800, 6))
    )
    val handler = summon[reactivemongo.api.bson.BSONDocumentHandler[Tournament]]
    val doc = handler.writeTry(tour).get
    val restored = handler.readDocument(doc).get
    assertEquals(restored.arenaSettings, tour.arenaSettings)
    assert(!restored.conditions.allowsBots)
    assertEquals(handler.readDocument(doc -- "noSweatArena").get.arenaSettings, NoSweatArenaSettings.default)

  test("public discovery never includes private, variant, position or team-battle tournaments"):
    import lila.db.dsl.{ *, given }
    val selector = NoSweatArenaDiscovery.publicEvents(List(UserId("host")))
    assertEquals(
      selector.getAsOpt[Bdoc]("createdBy").flatMap(_.getAsOpt[List[UserId]]("$in")),
      Some(List(UserId("host")))
    )
    for key <- List("password", "variant", "fen", "teamBattle") do
      assertEquals(selector.getAsOpt[Bdoc](key).flatMap(_.getAsOpt[Boolean]("$exists")), Some(false))
    assertEquals(
      NoSweatArenaDiscovery
        .publicEvents(Nil)
        .getAsOpt[Bdoc]("createdBy")
        .flatMap(_.getAsOpt[List[UserId]]("$in")),
      Some(Nil)
    )

  test("homepage spotlight respects the native 24-hour horizon, finish state and late-entry cutoff"):
    val now = nowInstant
    val tour = Tournament(
      id = TourId("spottest"),
      name = "Weekly",
      status = lila.core.tournament.Status.created,
      clock = chess.Clock.Config(chess.Clock.LimitSeconds(900), chess.Clock.IncrementSeconds(10)),
      minutes = 120,
      variant = chess.variant.Standard,
      position = None,
      rated = chess.Rated.Yes,
      conditions = TournamentCondition.All.empty,
      schedule = None,
      nbPlayers = 0,
      createdAt = now,
      createdBy = UserId("host"),
      startsAt = now.plusHours(23)
    )
    assert(NoSweatArenaDiscovery.spotlight(tour, now))
    assert(!NoSweatArenaDiscovery.spotlight(tour.copy(startsAt = now.plusHours(24)), now))
    assert(!NoSweatArenaDiscovery.spotlight(tour.copy(startsAt = now.plusDays(7)), now))
    assert(!NoSweatArenaDiscovery.spotlight(tour.copy(password = Some("secret")), now))
    assert(!NoSweatArenaDiscovery.spotlight(tour.copy(status = lila.core.tournament.Status.finished), now))
    assert(
      NoSweatArenaDiscovery.spotlight(
        tour.copy(status = lila.core.tournament.Status.started, startsAt = now.minusMinutes(60)),
        now
      )
    )
    assert(
      !NoSweatArenaDiscovery.spotlight(
        tour.copy(status = lila.core.tournament.Status.started, startsAt = now.minusMinutes(119)),
        now
      )
    )
