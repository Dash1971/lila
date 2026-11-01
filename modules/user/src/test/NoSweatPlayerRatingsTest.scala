package lila.user

class NoSweatPlayerRatingsTest extends munit.FunSuite:
  test("distribution retains current ratings above the native weekly chart's range"):
    val counts = NoSweatPlayerRatings.distribution(List(400, 424, 425, 2800, 3000, 3999, 4000))
    assertEquals(counts.sum, 7)
    assertEquals(counts.head, 2)
    assertEquals(counts(1), 1)
    assertEquals(counts((3000 - 400) / 25), 1)
    assertEquals(counts.last, 1)

  test("empty and out-of-range inputs keep finite bins without losing players"):
    assertEquals(NoSweatPlayerRatings.distribution(Nil).sum, 0)
    val counts = NoSweatPlayerRatings.distribution(List(399, 4001))
    assertEquals(counts.head, 1)
    assertEquals(counts.last, 1)
    assertEquals(counts.sum, 2)
