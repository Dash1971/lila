package lila.app

class NoSweatArenaRosterTest extends munit.FunSuite:
  test("select ten distinct saved ratings in the requested band, centered near 1500"):
    val candidates = (1100 to 1800 by 25).map(r => UserId(s"bot$r") -> r).toList
    val selected = NoSweatArenaRoster.select(candidates)
    assertEquals(selected.size, 10)
    assertEquals(selected.distinct.size, 10)
    assertEquals(selected.head, UserId("bot1500"))
    val ratings = candidates.toMap
    assert(selected.forall(id => ratings(id) >= 1200 && ratings(id) <= 1700))
  test("shortages do not create bots or expand the band"):
    val candidates = List(UserId("low") -> 1199, UserId("ok") -> 1500, UserId("high") -> 1701)
    assertEquals(NoSweatArenaRoster.select(candidates), List(UserId("ok")))
