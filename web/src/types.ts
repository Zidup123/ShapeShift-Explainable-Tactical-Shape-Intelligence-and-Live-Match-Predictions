export interface Match {
  match_id: string;
  matchday: number;
  home_id: string;
  home_name: string;
  away_id: string;
  away_name: string;
  home_goals: number;
  away_goals: number;
  home_xg: number;
  away_xg: number;
}

export interface Player {
  team_id: string;
  player_id: string;
  x: number;
  y: number;
  is_gk: boolean;
}

export interface OverloadZone {
  zone: string;
  attackers: number;
  defenders: number;
  overload: number;
  rest_defence: number;
}

export interface ShapeInfo {
  in_possession: string;
  out_of_possession: string;
  fit_score: number;
}

export interface Prediction {
  p_next_goal_home: number;
  p_next_goal_away: number;
  xg_next_15_home: number;
  xg_next_15_away: number;
  counter_risk: number;
}

export interface MatchState {
  match_id: string;
  minute: number;
  home_id: string;
  away_id: string;
  home_goals: number;
  away_goals: number;
  possession_team: string;
  ball_x: number;
  ball_y: number;
  players: Player[];
  shapes: { home: ShapeInfo; away: ShapeInfo };
  overloads: OverloadZone[];
  prediction: Prediction;
}

export interface PredictionPoint {
  minute: number;
  p_next_goal_home: number;
  p_next_goal_away: number;
  xg_next_15_home: number;
  xg_next_15_away: number;
  counter_risk: number;
}

export interface Fact {
  claim: string;
  numbers: Record<string, number>;
  evidence_ids: string[];
  sample_size: number;
  confidence: string;
}
