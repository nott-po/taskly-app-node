import { Badge, Text } from '../../../design-system'
import { useTodoStatsQuery } from '../hooks/useTodoStatsQuery'

export function TodoStats() {
  const { data, isPending, isError } = useTodoStatsQuery()
  if (isPending) return null
  if (isError)
    return (
      <Text muted size="small">
        Task statistics are unavailable.
      </Text>
    )
  if (!data.total) return null
  return (
    <section aria-label="Task statistics" className="row compact">
      <Badge variant="neutral">
        {data.total} {data.total === 1 ? 'task' : 'tasks'}
      </Badge>
      <Badge variant="info">{data.active} active</Badge>
      <Badge variant="success">{data.completed} completed</Badge>
      {data.overdue > 0 && (
        <Badge variant="warning">{data.overdue} overdue</Badge>
      )}
    </section>
  )
}
