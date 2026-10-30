package lila.user

object NoSweatUserSearch:
  def read(raw: String): Option[String] =
    val term = raw.trim
    Option.when(term.length >= 2 && term.length <= 30 && !term.exists(_.isControl))(term)

  def literalPrefix(term: String): String = "^" + java.util.regex.Pattern.quote(term)
