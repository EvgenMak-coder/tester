import { Link, Navigate, useParams } from 'react-router-dom'
import { testsPath } from '../../app/paths'
import { hueClass, ModuleIcon } from '../../components/ModuleIcon'
import { Markdown } from '../../components/Markdown'
import { Page } from '../../components/ui'
import { useData } from '../../data/hooks'
import { LEVEL_TITLES, LEVELS, type Level } from '../../quiz/types'

/** Теория одного уровня модуля: текст раздела или, пока он не написан, его план. */
export function TheoryPage() {
  const { id, topicId, level } = useParams()
  const snapshot = useData()

  const course = snapshot.courses.find((c) => c.id === id)
  if (!course) return <Navigate to="/" replace />
  const topicIndex = course.topics.findIndex((t) => t.id === topicId)
  const topic = course.topics[topicIndex]
  const lesson = topic && LEVELS.includes(level as Level) ? topic.theory?.[level as Level] : undefined
  if (!topic || !lesson) return <Navigate to={topic ? testsPath(course.id, topic.id) : '/'} replace />

  return (
    <Page
      title={`${topic.title}: теория`}
      back={{ to: testsPath(course.id, topic.id), label: topic.title }}
      lead={`${LEVEL_TITLES[level as Level]} уровень`}
      icon={
        <span className={hueClass(topicIndex)}>
          <ModuleIcon name={topic.icon} size={26} />
        </span>
      }
    >
      {lesson.text ? (
        <Markdown source={lesson.text} />
      ) : (
        <div className="card stack">
          <p className="muted">Текст раздела ещё не написан. В нём будет:</p>
          <ul className="plan">{lesson.plan?.map((point) => <li key={point}>{point}</li>)}</ul>
        </div>
      )}
      <div className="row">
        <Link className="btn primary" to={testsPath(course.id, topic.id)}>
          К тестам модуля
        </Link>
      </div>
    </Page>
  )
}
