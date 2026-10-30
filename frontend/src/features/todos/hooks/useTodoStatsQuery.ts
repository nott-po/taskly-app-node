import { useQuery } from '@tanstack/react-query'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { localDate } from '../utils/todos'

export function useTodoStatsQuery() {
  const today = localDate()
  return useQuery({
    queryKey: [...todoKeys.stats, today],
    queryFn: ({ signal }) => todosApi.stats(today, signal),
  })
}
