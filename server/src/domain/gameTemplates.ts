import type { EventType, EventTypeOption, GameTemplate } from '../../../shared/types'

/** Lookup surface the routes depend on, so games stay data rather than code. */
export interface TemplateRegistry {
  list: () => GameTemplate[]
  get: (gameId: string) => GameTemplate | undefined
  eventTypeOption: (gameId: string, eventType: EventType) => EventTypeOption | undefined
}

/** TODO(green): Magic: The Gathering, Pokemon TCG and Disney Lorcana. */
export const GAME_TEMPLATES: GameTemplate[] = []

/** TODO(green): build a registry from template data. */
export function createTemplateRegistry(_templates: GameTemplate[]): TemplateRegistry {
  throw new Error('not implemented: createTemplateRegistry')
}

export const gameTemplates: TemplateRegistry = {
  list: () => { throw new Error('not implemented: gameTemplates.list') },
  get: () => { throw new Error('not implemented: gameTemplates.get') },
  eventTypeOption: () => { throw new Error('not implemented: gameTemplates.eventTypeOption') },
}
