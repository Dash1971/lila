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
