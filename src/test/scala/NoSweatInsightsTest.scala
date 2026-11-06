package lila.app

import lila.insight.{ JsonQuestion, NoSweatInsights }

class NoSweatInsightsTest extends munit.FunSuite:
  test("native results and rating questions work without exposing engine-dependent queries"):
    assert(NoSweatInsights.accepts(JsonQuestion("openingFamily", "result", Map("color" -> List("white")))))
    assert(NoSweatInsights.accepts(JsonQuestion("date", "opponentRating", Map("period" -> List("30")))))
    assert(!NoSweatInsights.accepts(JsonQuestion("phase", "accuracy", Map.empty)))
    assert(!NoSweatInsights.accepts(JsonQuestion("color", "result", Map("accuracy" -> List("90")))))
    assert(!NoSweatInsights.accepts(JsonQuestion("variant", "result", Map("variant" -> List("atomic")))))
    assert(NoSweatInsights.accepts(JsonQuestion("variant", "ratingDiff", Map("variant" -> List("blitz")))))
