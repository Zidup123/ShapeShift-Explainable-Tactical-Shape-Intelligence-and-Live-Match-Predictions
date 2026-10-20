export const API = {
  getMatches: () => fetch('/api/matches').then(r => r.json()),
  getMatchState: (id: string, minute: number) =>
    fetch(`/api/matches/${id}/state/${minute}`).then(r => r.json()),
  getPredictions: (id: string) =>
    fetch(`/api/matches/${id}/predictions`).then(r => r.json()),
  getLiveStats: (id: string) =>
    fetch(`/api/matches/${id}/livestats`).then(r => r.json()),
  getNarrative: (id: string, minute: number) =>
    fetch(`/api/matches/${id}/narrative/${minute}`).then(r => r.json()),
  getFacts: () => fetch('/api/facts').then(r => r.json()),
  getTeamSeason: (id: string) =>
    fetch(`/api/teams/${id}/season`).then(r => r.json()),
}
