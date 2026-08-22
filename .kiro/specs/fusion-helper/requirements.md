# Requirements — Fusion Helper

## Introduction

The Fusion Helper is a new standalone tool in the TTF Companion web app that helps players plan for the game's weekly **Fusion** event. The Fusion event is a game mechanic (not something this app runs); the helper is a planning and calculation aid.

Each week the game releases a fusion target defined by six attributes. Players assemble 10 cards, arranged in 3–4 rows, to earn a reward whose likelihood scales with a computed **synergy bonus**. The Fusion Helper reads the weekly fusion definition from a new tab in the existing published Google Sheet and computes each card's synergy contribution. It supports two core use cases:

1. **Filter cards by synergy** — find eligible cards within a synergy bonus range (min–max), with a toggle for parallels and a filter by fusion row.
2. **Suggest combinations** — show the combinations of per-card synergy values that reach the 20 / 40 / 100 reward tiers.

The tool works entirely off the full card database and deliberately does **not** depend on the user's tracked collection.

## Glossary

- **Fusion**: The weekly game event. Defined by six attributes and a set of row requirements.
- **Fusion attributes (6)**: Player (name), Club, Position, Skill Type 1, Skill Type 2, Set. A card matching at least one of these is eligible for the fusion.
- **Attribute match count**: The number of the six fusion attributes a given card matches.
- **Attribute-match synergy**: Points a card contributes based on its attribute match count: 1 match → 0, 2 → 2, 3 → 5, 4 → 8, 5 or more → 12.
- **Parallel bonus**: Additional synergy added on top of attribute-match synergy when a parallel version of the card is used.
- **Digital parallels**: Base, α/α, #/77, #/66, #/44, #/11, Ω/Ω.
- **Printable (physical) parallels**: /99, /75, /50, /25, /10, /5, /1. These have no play styles (no Skill Type 1/2).
- **Card synergy value**: The total synergy a single card contributes = attribute-match synergy + parallel bonus.
- **Total synergy bonus**: The sum of card synergy values across the 10 cards in a fusion.
- **Tier**: A reward multiplier band determined by total synergy bonus (1x base, 2x, 4x, guaranteed).
- **Row requirement**: A constraint on the cards allowed in a given fusion row (e.g. Player = "Kaka", Skill Type in {accuracy, control}, Set = "Base PL").
- **Synergy-value combination**: A multiset of 10 per-card synergy values whose sum meets a target (e.g. 5+5+5+5+0+0+0+0+0+0 = 20).

## Open Questions (TBD — tracked, not blocking)

1. **Row-requirement syntax**: The exact parsable string format for the "Row N Requirement" columns is not yet defined.
2. **Printable parallel synergy points**: The additional synergy for /5, /10, /25, /50, /75 (and whether /99, /1 apply) is unknown.
3. **Guaranteed-tier multiplier**: Whether the 100-point tier has a numeric multiplier or is purely "guaranteed".
4. **Tier thresholds**: Confirm 20 (2x), 40 (4x), 100 (guaranteed) are exact.

---

## Requirements

### Requirement 1: Load the weekly fusion definition

**User Story:** As a player, I want the helper to load the current weekly fusion definition from the shared Google Sheet, so that the tool reflects the active event without manual data entry.

#### Acceptance Criteria

1. WHEN the Fusion Helper page loads THEN the system SHALL fetch the fusion definition from the designated published Google Sheet tab using the existing shared CSV loading pattern.
2. WHERE the fusion tab is parsed THE system SHALL read columns by header text (order-independent): Week, Player, Club, Position, Skill Type 1, Skill Type 2, Set, Row 1 Count, Row 1 Requirement, Row 2 Count, Row 2 Requirement, Row 3 Count, Row 3 Requirement, Row 4 Count, Row 4 Requirement.
3. IF a fusion row's Count and Requirement columns are blank THEN the system SHALL treat that row as absent (supporting 3-row and 4-row fusions).
4. IF the fusion definition fails to load THEN the system SHALL display an error message and SHALL NOT crash.
5. WHEN more than one fusion week is present in the tab THEN the system SHALL allow the user to select which week to view.

### Requirement 2: Compute attribute-match synergy per card

**User Story:** As a player, I want each card scored by how many fusion attributes it matches, so that I know its base synergy contribution.

#### Acceptance Criteria

1. WHEN scoring a card against the active fusion THE system SHALL count how many of the six fusion attributes (Player, Club, Position, Skill Type 1, Skill Type 2, Set) the card matches.
2. WHERE a card's attribute match count is N THE system SHALL assign attribute-match synergy as: N=1 → 0, N=2 → 2, N=3 → 5, N=4 → 8, N≥5 → 12.
3. IF a card matches zero fusion attributes THEN the system SHALL treat the card as ineligible for the fusion.
4. WHERE the card is a printable (physical) parallel THE system SHALL NOT count Skill Type 1 or Skill Type 2 when computing the attribute match count.
5. WHEN comparing a Skill Type attribute THE system SHALL match the card's Skill Type #1 or Skill Type #2 against the fusion's Skill Type 1 or Skill Type 2 attributes.

### Requirement 3: Apply parallel synergy bonus

**User Story:** As a player, I want parallels to add their synergy bonus on top of attribute matches, so that I can see the full value of using a parallel card.

#### Acceptance Criteria

1. WHERE a card is a digital parallel THE system SHALL add the parallel bonus: α/α → +1, #/77 → +2, #/66 → +3, #/44 → +4, #/11 → +5, Ω/Ω → +7.
2. WHERE a card is Base (no parallel) THE system SHALL add a parallel bonus of 0.
3. WHERE a card is a printable parallel THE system SHALL apply its parallel bonus using a configurable mapping (values TBD) and SHALL degrade gracefully (treat unknown values as 0) until the mapping is finalized.
4. WHEN computing a card's synergy value THE system SHALL compute attribute-match synergy + parallel bonus.

### Requirement 4: Determine reward tier from total synergy

**User Story:** As a player, I want to know which reward tier a total synergy bonus reaches, so that I can aim for a worthwhile outcome.

#### Acceptance Criteria

1. WHERE the total synergy bonus is below 20 THE system SHALL report tier 1x (base).
2. WHERE the total synergy bonus is at least 20 and below 40 THE system SHALL report tier 2x.
3. WHERE the total synergy bonus is at least 40 and below 100 THE system SHALL report tier 4x.
4. WHERE the total synergy bonus is at least 100 THE system SHALL report the guaranteed tier.
5. WHERE tier thresholds are defined THE system SHALL keep them in a single configurable location so they can be corrected if the confirmed values differ.

### Requirement 5: Filter cards by synergy, parallels, and row

**User Story:** As a player, I want to filter cards by their synergy bonus, by whether parallels are allowed, and by which fusion row they qualify for, so that I can quickly find the cards useful for a specific slot.

#### Acceptance Criteria

1. WHEN the user sets a synergy range with a minimum and maximum THE system SHALL display all eligible cards whose synergy value falls within that inclusive range for the active fusion.
2. WHERE the synergy range is presented THE system SHALL provide a min–max range control (dual slider) bounded by the lowest and highest attainable synergy values for the active fusion.
3. WHEN the user sets the minimum equal to the maximum THE system SHALL display only cards at exactly that synergy value.
4. WHEN the user toggles "include parallels" on THE system SHALL compute each card's synergy value across its available parallel versions and include parallel-derived synergy values in filtering; WHEN toggled off THE system SHALL restrict synergy values to Base cards (attribute-match synergy only).
5. WHEN the user selects a fusion row THE system SHALL display only cards that satisfy that row's requirement AND are fusion-eligible; WHERE the row selector is set to its default THE system SHALL not constrain by row (any row).
6. WHEN displaying a card THE system SHALL show which fusion attributes it matched, its resulting synergy value, and the parallel version used (if any).
7. WHERE no cards match the current filter THE system SHALL show an empty-state message rather than an error.

### Requirement 6: Combination suggester

**User Story:** As a player, I want to see the combinations of per-card synergy values that reach a target, so that I can plan how to assemble 10 cards.

#### Acceptance Criteria

1. WHEN the user selects a target of 20, 40, or 100 THE system SHALL enumerate combinations of 10 per-card synergy values whose sum is at least the target.
2. WHERE "include parallels" is enabled THE system SHALL draw candidate per-card synergy values from the full set of attainable values (attribute-match synergy plus parallel bonuses); WHERE it is disabled THE system SHALL restrict candidate values to attribute-match synergy only (0, 2, 5, 8, 12).
3. WHEN presenting a combination THE system SHALL present it as a multiset of synergy values (e.g. 5+5+5+5+0+0+0+0+0+0) and SHALL NOT be required to list exact card identities.
4. WHERE a combination requires K cards at a given synergy level THE system SHALL sanity-check that at least K distinct eligible cards actually exist at that synergy level for the active fusion, and SHALL flag combinations that are not feasible.
5. WHEN multiple combinations reach the target THE system SHALL present them in a readable, de-duplicated list.

### Requirement 7: Standalone tool consistent with the app

**User Story:** As a user, I want the Fusion Helper to feel like part of the app, so that navigation and look-and-feel are consistent.

#### Acceptance Criteria

1. WHERE the Fusion Helper is added THE system SHALL be a standalone page consistent with the existing Deck Builder and Collection Tracker pages and SHALL reuse the shared modules and styles.
2. WHERE the Fusion Helper computes synergy THE system SHALL NOT require sign-in and SHALL NOT read the user's collection data.
3. WHEN the landing page is shown THE system SHALL provide navigation to the Fusion Helper alongside the existing tools.

## Correctness Properties

These properties should hold for all inputs and are candidates for property-based testing during implementation:

- **P1 (match count mapping is monotonic and exact):** For any card, attribute-match synergy is exactly the step function {1→0, 2→2, 3→5, 4→8, ≥5→12} of its match count, and never negative.
- **P2 (printable parallels ignore play styles):** For any printable-parallel card, its match count never includes Skill Type 1/2; its match count is always ≤ the match count of the equivalent Base card.
- **P3 (synergy value composition):** A card's synergy value always equals attribute-match synergy + parallel bonus, and equals attribute-match synergy exactly when the card is Base.
- **P4 (tier is a well-ordered threshold function):** Total synergy maps to exactly one tier; higher totals never map to a lower tier.
- **P5 (suggester sums meet target):** Every combination the suggester presents sums to at least the selected target and contains exactly 10 values.
- **P6 (feasibility soundness):** Every combination the suggester marks feasible has, for each synergy level, at least as many distinct eligible cards available as the combination requires at that level.
- **P7 (parallel toggle restricts value domain):** With parallels disabled, every value in every presented combination — and every card synergy value shown by the filter — is in {0, 2, 5, 8, 12}.
- **P8 (range filter soundness and completeness):** For any min–max synergy range, the filter shows exactly the set of eligible cards whose synergy value is within [min, max] — no card outside the range appears, and no in-range eligible card is omitted.
- **P9 (row filter soundness):** When a row is selected, every card shown satisfies that row's requirement and is fusion-eligible; with the row selector at its default, no card is excluded on the basis of row.
