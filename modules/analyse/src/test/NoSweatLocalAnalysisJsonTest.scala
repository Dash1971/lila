package lila.analyse

import play.api.libs.json.*

class NoSweatLocalAnalysisJsonTest extends munit.FunSuite:
  import JsonView.given

  private def document(engine: JsObject) = Json.obj(
    "id" -> "abcdefgh",
    "initialEval" -> Json.obj("cp" -> 20),
    "infos" -> Json.arr(Json.obj("ply" -> 1, "eval" -> Json.obj("cp" -> 25), "variation" -> Json.arr())),
    "startPly" -> 0,
    "date" -> "2026-11-23T00:00:00Z",
    "engine" -> engine
  )

  private val engine = Json.obj("nodesPerMove" -> 100000, "version" -> "Stockfish 19")

  test("public browser review metadata produces native summary and moves"):
    val result =
      JsonView.augmentLocalAnalysis(Json.obj("analysis" -> document(engine), "division" -> Json.obj()))
    assert(result.isSuccess)
    assertEquals((result.get \ "moves").as[JsArray].value.size, 1)
    assert((result.get \ "summary").toOption.isDefined)

  test("internal engine and account identities are not taken from the browser"):
    val input = engine ++ Json.obj("id" -> "fishnet", "userId" -> "admin", "fishnetKey" -> "untrusted")
    val parsed = document(input).as[lila.tree.Analysis].engine
    assertEquals(parsed.id, lila.tree.Engine.unknown.id)
    assertEquals(parsed.userId, lila.tree.Engine.unknown.userId)
    assertEquals(parsed.fishnetKey, None)
    assertEquals(parsed.engineVersion, "Stockfish 19")

  test("missing or incorrectly typed public engine metadata is rejected"):
    for invalid <- List(Json.obj(), engine - "version", engine ++ Json.obj("nodesPerMove" -> "bad")) do
      assert(document(invalid).validate[lila.tree.Analysis].isError)
