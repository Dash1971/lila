package lila.chat

import lila.core.LightUser

class ChatPublicNameTest extends munit.FunSuite:
  private val name = UserName("n066f8597b3952d996bc")
  private val line = UserLine(name, "Good game", troll = false, deleted = false)

  test("initial and live line writer adds a public label without changing canonical authorship"):
    val user = LightUser.fallback(name).copy(displayName = Some("Dash <&>"))
    val json = ChatJsonView.userLineWriter(Map(user.id -> user)).writes(line)
    assertEquals((json \ "u").as[String], name.value)
    assertEquals((json \ "displayName").as[String], "Dash <&>")
    assertEquals((json \ "t").as[String], "Good game")
    assertEquals(Line.userLineToStr(line), s"${name.value} Good game")

  test("missing or empty labels preserve old payloads and BOT titles remain independent"):
    for label <- List(None, Some("")) do
      val user = LightUser.fallback(name).copy(displayName = label)
      val json = ChatJsonView.userLineWriter(Map(user.id -> user)).writes(line)
      assertEquals((json \ "u").as[String], name.value)
      assertEquals((json \ "displayName").asOpt[String], None)
    val bot =
      LightUser.fallback(name).copy(title = Some(chess.PlayerTitle.BOT), displayName = Some("LynxSocket"))
    val json = ChatJsonView.userLineWriter(Map(bot.id -> bot)).writes(line)
    assertEquals((json \ "title").as[String], "BOT")
    assertEquals((json \ "displayName").as[String], "LynxSocket")
    assertEquals((json \ "u").as[String], name.value)
