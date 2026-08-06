# D4 tools 规则追踪映射表

- rulesetId：undercover_blank_v1
- gameId：undercover
- kind：platform_variant / releaseStatus：internal_prototype
- sourceDocuments：docs/superpowers/specs/2026-08-02-shared-game-engine-design.md#已确认的谁是卧底规则集；docs/superpowers/specs/2026-08-02-shared-game-engine-design.md#外部模型失败策略；docs/superpowers/plans/2026-08-05-d4-new-capabilities-master-plan.md；packages/games/undercover/server/module.ts；packages/games/undercover/shared/manifest.ts
- 条款总数：18 / 差异总数：3
- 汇总：已映射实现 0/18，已映射测试 0/68

## 条款 → 实现 → 测试

| 条款 | 来源 | 实现 | 测试 | 覆盖 |
| --- | --- | --- | --- | --- |
| UNDERCOVER-BLANK-GOV-001 | Undercover ruleset split (lines 762–767) | UNMAPPED | UNMAPPED（undercover_blank_registers_separately_from_classic_test, undercover_blank_is_not_playable_before_acceptance_test, undercover_blank_rejects_mutable_role_semantics_test） | 否 |
| UNDERCOVER-BLANK-GOV-002 | Undercover locked configuration (line 767) | UNMAPPED | UNMAPPED（undercover_blank_reveal_mode_is_snapshot_locked_test, undercover_blank_midgame_identity_config_change_is_rejected_test） | 否 |
| UNDERCOVER-BLANK-SETUP-001 | Blank setup (line 783) | UNMAPPED | UNMAPPED（undercover_blank_accepts_four_to_twelve_players_test, undercover_blank_rejects_players_outside_range_test, undercover_blank_shows_five_to_eight_balance_hint_without_enforcement_test） | 否 |
| UNDERCOVER-BLANK-ROLE-001 | Blank roles (lines 784–785) | UNMAPPED | UNMAPPED（undercover_blank_assigns_exactly_one_blank_test, undercover_blank_assigns_no_worded_undercover_test, undercover_blank_civilians_share_one_word_test） | 否 |
| UNDERCOVER-BLANK-ROLE-002 | Blank roles (line 786) | UNMAPPED | UNMAPPED（undercover_blank_secret_is_explicit_no_word_variant_test, undercover_blank_counts_as_undercover_side_test） | 否 |
| UNDERCOVER-BLANK-WIN-001 | Blank win condition (line 787) | UNMAPPED | UNMAPPED（undercover_blank_wins_at_blank_plus_one_civilian_test, undercover_blank_does_not_win_before_threshold_test, undercover_blank_survival_outcome_stays_provisional_when_earlier_guess_pending_test） | 否 |
| UNDERCOVER-BLANK-GUESS-001 | Active guess opportunity (lines 788–789) | UNMAPPED | UNMAPPED（undercover_blank_has_exactly_one_guess_opportunity_test, undercover_blank_can_guess_in_each_approved_active_phase_test, undercover_blank_guess_is_secret_test, undercover_blank_cannot_guess_before_speaking_or_during_settlement_test, undercover_blank_second_guess_is_rejected_test） | 否 |
| UNDERCOVER-BLANK-GUESS-002 | Active guess outcome (line 790) | UNMAPPED | UNMAPPED（undercover_blank_active_correct_guess_wins_test, undercover_blank_active_wrong_guess_eliminates_blank_test, undercover_blank_wrong_guess_never_restores_opportunity_test） | 否 |
| UNDERCOVER-BLANK-FINAL-001 | Final guess trigger and reveal (lines 791–792) | UNMAPPED | UNMAPPED（undercover_blank_voted_out_unused_opportunity_opens_final_guess_test, undercover_blank_final_guess_deadline_is_thirty_seconds_test, undercover_blank_immediate_mode_reveals_identity_before_final_guess_test, undercover_blank_delayed_mode_does_not_reveal_identity_early_test, undercover_blank_no_final_guess_after_active_submission_test） | 否 |
| UNDERCOVER-BLANK-FINAL-002 | Approved blank digital boundary | UNMAPPED | UNMAPPED（undercover_blank_final_guess_submits_once_test, undercover_blank_final_skip_is_incorrect_test, undercover_blank_final_timeout_is_incorrect_test, undercover_blank_rule_bot_never_actively_guesses_test, undercover_blank_rule_bot_skips_final_without_standard_answer_test） | 否 |
| UNDERCOVER-BLANK-NORM-001 | Guess normalization (line 793) and approved normalization policy | UNMAPPED | UNMAPPED（blank_normalization_v1_applies_nfc_test, blank_normalization_v1_trims_and_collapses_unicode_whitespace_test, blank_normalization_v1_lowercases_latin_test, blank_normalization_v1_retains_punctuation_test, blank_normalization_v1_does_not_convert_simplified_traditional_test, blank_normalization_v1_does_not_infer_synonyms_test） | 否 |
| UNDERCOVER-BLANK-NORM-002 | Approved normalization input boundary | UNMAPPED | UNMAPPED（blank_normalization_v1_accepts_one_to_sixty_four_code_points_test, blank_normalization_v1_rejects_empty_input_test, blank_normalization_v1_rejects_over_sixty_four_code_points_test, blank_normalization_v1_counts_non_bmp_as_one_code_point_test, blank_normalization_v1_rejects_control_characters_and_newlines_test） | 否 |
| UNDERCOVER-BLANK-ADJ-001 | Guess adjudication (lines 793–794) and external model failure policy (lines 660–678) | UNMAPPED | UNMAPPED（undercover_blank_local_exact_match_is_equivalent_without_provider_test, undercover_blank_nonexact_invokes_main_provider_test, undercover_blank_main_uncertain_or_failure_invokes_independent_fallback_test, undercover_blank_main_definite_not_equivalent_does_not_invoke_fallback_test, undercover_blank_only_equivalent_is_correct_test, undercover_blank_two_nonfinal_provider_results_are_wrong_test） | 否 |
| UNDERCOVER-BLANK-ADJ-002 | External adjudication privacy policy (lines 669–676) and approved provider boundary | UNMAPPED | UNMAPPED（undercover_blank_provider_payload_contains_only_approved_fields_test, undercover_blank_provider_output_is_structured_and_timeout_bounded_test, undercover_blank_fallback_cannot_observe_main_verdict_test, undercover_blank_provider_logs_exclude_credentials_headers_and_game_secrets_test） | 否 |
| UNDERCOVER-BLANK-ASYNC-001 | Async continuation (line 795) | UNMAPPED | UNMAPPED（undercover_blank_pending_adjudication_does_not_block_speaking_test, undercover_blank_pending_adjudication_does_not_block_voting_or_runoff_test） | 否 |
| UNDERCOVER-BLANK-ASYNC-002 | Submission-time trace and provisional override (line 796) | UNMAPPED | UNMAPPED（undercover_blank_submission_freezes_eligibility_and_sequence_test, undercover_blank_pending_guess_makes_later_ordinary_result_provisional_test, undercover_blank_earlier_equivalent_guess_overrides_provisional_result_test, undercover_blank_wrong_guess_confirms_or_continues_ordinary_outcome_test） | 否 |
| UNDERCOVER-BLANK-TASK-001 | External task recovery policy (line 680) | UNMAPPED | UNMAPPED（undercover_blank_adjudication_task_id_is_unique_test, undercover_blank_late_result_after_final_is_ignored_test, undercover_blank_restart_resumes_task_without_second_opportunity_test, undercover_blank_event_replay_makes_zero_provider_calls_test） | 否 |
| UNDERCOVER-BLANK-TASK-002 | Approved adjudication retention boundary | UNMAPPED | UNMAPPED（undercover_blank_pending_task_persists_only_required_plaintext_test, undercover_blank_applied_task_erases_answer_and_guess_plaintext_test, undercover_blank_applied_task_retains_only_bounded_audit_metadata_test） | 否 |

> 说明：UNMAPPED 表示未在 `packages/games/{gameId}/server` 源码或 `tests` 目录解析到对应实现/用例；内联 `implementations`/`tests` 映射优先。

