import SwiftUI

/// App state + menu logic. Saved as JSON in the app's Documents folder.
@MainActor
final class AppStore: ObservableObject {
    @Published var state: SavedState { didSet { save() } }

    // Generate flow (not saved until the user confirms)
    @Published var isGenerating = false
    @Published var draft: [DraftDay] = []
    @Published var draftWeekStart = Fmt.upcomingMonday()
    @Published var draftHave: [String: Bool] = [:]

    let catalog = Catalog.shared

    private static var fileURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("menu-mingguan.json")
    }

    init() {
        if let raw = try? Data(contentsOf: Self.fileURL),
           let saved = try? JSONDecoder().decode(SavedState.self, from: raw) {
            state = saved
        } else {
            var fresh = SavedState()
            fresh.favorites = Catalog.shared.data.menus.favorites.compactMap { id in
                Catalog.shared.mains[id].map { "\(id)|\($0.defaultSideId)" }
            }
            state = fresh
        }
    }

    private func save() {
        if let raw = try? JSONEncoder().encode(state) {
            try? raw.write(to: Self.fileURL, options: .atomic)
        }
    }

    // MARK: Lookups

    func isKidFriendly(_ mainId: String) -> Bool {
        state.kidOverrides[mainId] ?? catalog.mains[mainId]?.kidFriendly ?? false
    }

    func favKey(_ mainId: String, _ sideId: String) -> String { "\(mainId)|\(sideId)" }

    func isFavorite(_ mainId: String, _ sideId: String) -> Bool { state.favorites.contains(favKey(mainId, sideId)) }

    var favoriteMainIds: [String] { state.favorites.compactMap { $0.split(separator: "|").first.map(String.init) } }

    func toggleFavorite(_ mainId: String, _ sideId: String) {
        let key = favKey(mainId, sideId)
        if let i = state.favorites.firstIndex(of: key) { state.favorites.remove(at: i) } else { state.favorites.insert(key, at: 0) }
    }

    // MARK: Generating

    func startGenerating() {
        draftWeekStart = Fmt.upcomingMonday()
        draft = generateDays()
        draftHave = [:]
        isGenerating = true
    }

    private func uniqueSide(_ preferred: String, used: [String]) -> String {
        if !used.contains(preferred) { return preferred }
        return catalog.data.menus.sides.map(\.id).filter { !used.contains($0) }.randomElement() ?? preferred
    }

    private func freshKid(used: [String]) -> String {
        let all = catalog.data.menus.kids.map(\.id)
        return all.filter { !used.contains($0) }.randomElement() ?? all.randomElement() ?? ""
    }

    func generateDays() -> [DraftDay] {
        let mains = catalog.data.menus.mains
        var picks: [String] = []
        func add(_ id: String) { if !picks.contains(id) { picks.append(id) } }
        if state.preferFav { favoriteMainIds.shuffled().prefix(3).forEach(add) }
        for id in mains.filter({ $0.source == "user" }).map(\.id).shuffled() where picks.count < 6 { add(id) }
        for id in mains.map(\.id).shuffled() where picks.count < 7 { add(id) }

        let kidMenus = catalog.data.menus.kids.map(\.id).shuffled()
        var usedSides: [String] = []
        return picks.shuffled().enumerated().map { i, id in
            let side = uniqueSide(catalog.mains[id]?.defaultSideId ?? "", used: usedSides)
            usedSides.append(side)
            return DraftDay(mainId: id, sideId: side, kidMenuId: kidMenus[i % kidMenus.count])
        }
    }

    func reroll(_ i: Int) {
        let used = draft.map(\.mainId)
        let fromUser = Double.random(in: 0..<1) < 0.75
        let mains = catalog.data.menus.mains
        var pool = mains.filter { !used.contains($0.id) && ($0.source == (fromUser ? "user" : "online")) }
        if pool.isEmpty { pool = mains.filter { !used.contains($0.id) } }
        guard let m = pool.randomElement() else { return }
        let usedSides = draft.enumerated().filter { $0.offset != i }.map(\.element.sideId)
        draft[i].mainId = m.id
        draft[i].sideId = uniqueSide(m.defaultSideId, used: usedSides)
    }

    func rerollKid(_ i: Int) {
        var used = draft.enumerated().filter { $0.offset != i && !isKidFriendly($0.element.mainId) }.map(\.element.kidMenuId)
        used.append(draft[i].kidMenuId)
        draft[i].kidMenuId = freshKid(used: used)
    }

    func toggleKidFriendly(_ mainId: String) {
        state.kidOverrides[mainId] = !isKidFriendly(mainId)
        // Keep the kids menus unique across days that now need their own menu.
        var used: [String] = []
        for i in draft.indices where !isKidFriendly(draft[i].mainId) {
            if used.contains(draft[i].kidMenuId) { draft[i].kidMenuId = freshKid(used: used) }
            used.append(draft[i].kidMenuId)
        }
    }

    func kidId(for d: DraftDay) -> String? { isKidFriendly(d.mainId) ? nil : d.kidMenuId }

    var draftAsPlan: [DayPlan] { draft.map { DayPlan(mainId: $0.mainId, sideId: $0.sideId, kidId: kidId(for: $0)) } }

    func prefillPantry() {
        for cat in shopping(for: draftAsPlan) {
            for item in cat.items where item.pantry && draftHave[item.id] == nil { draftHave[item.id] = true }
        }
    }

    func confirmDraft() {
        state.plan = WeekPlan(weekStart: draftWeekStart, days: draftAsPlan)
        state.shopping = draftHave.filter { $0.value }
        isGenerating = false
    }

    // MARK: Shopping list

    func shopping(for days: [DayPlan]) -> [ShoppingCategory] {
        struct Acc { var qty = 0.0; var hasQty = false; var uses: [String] = [] }
        var acc: [String: Acc] = [:]
        for (i, d) in days.enumerated() {
            let parts: [(String?, String)] = [(d.mainId, Fmt.dayLabel[i]), (d.sideId, Fmt.dayLabel[i]), (d.kidId, "Anak " + Fmt.dayLabel[i])]
            for (rid, label) in parts {
                guard let rid, let r = catalog.recipe(rid) else { continue }
                for ing in r.ingredients where catalog.ingredients[ing.id] != nil {
                    var a = acc[ing.id] ?? Acc()
                    if let q = ing.qty { a.qty += q; a.hasQty = true }
                    if !a.uses.contains(label) { a.uses.append(label) }
                    acc[ing.id] = a
                }
            }
        }
        return Fmt.categories.map { cat in
            let items = acc.compactMap { id, a -> ShoppingItem? in
                guard let ing = catalog.ingredients[id], ing.category == cat.id else { return nil }
                return ShoppingItem(
                    id: id,
                    name: ing.name,
                    qty: a.hasQty ? Fmt.qty(a.qty, unit: ing.unit) : "secukupnya",
                    use: a.uses.count >= 6 ? "hampir semua menu" : a.uses.joined(separator: ", "),
                    pantry: ing.pantry ?? false
                )
            }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
            return ShoppingCategory(id: cat.id, label: cat.label, items: items)
        }
    }

    var planShopping: [ShoppingCategory] { state.plan.map { shopping(for: $0.days) } ?? [] }

    var itemsLeft: Int {
        planShopping.reduce(0) { n, c in n + c.items.filter { state.shopping[$0.id] != true }.count }
    }
}
