import type { Level } from '../quiz/types'

export const coursePath = (courseId: string): string => `/course/${courseId}`

/** Страница с тестами: одного модуля или, без topicId, всего курса сразу. */
export const testsPath = (courseId: string, topicId?: string): string => (topicId ? `/course/${courseId}/module/${topicId}` : `/course/${courseId}/all`)

export const theoryPath = (courseId: string, topicId: string, level: Level): string => `/course/${courseId}/module/${topicId}/theory/${level}`
