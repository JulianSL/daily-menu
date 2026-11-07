import SwiftUI

/// Ingredients + steps for one recipe, with Utama / Pendamping / Anak tabs.
struct RecipeTabs: View {
    let mainId: String
    let sideId: String
    let kidId: String?
    @State private var tab = 0

    var body: some View {
        let catalog = Catalog.shared
        VStack(alignment: .leading, spacing: 18) {
            Picker("Bagian set menu", selection: $tab) {
                Text("Utama").tag(0)
                Text("Pendamping").tag(1)
                if kidId != nil { Text("Anak").tag(2) }
            }
            .pickerStyle(.segmented)

            if tab == 2, kidId != nil {
                Text("\(catalog.name(mainId)) kurang cocok untuk anak, jadi anak dibuatkan 1 menu utama sendiri.")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.kid)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.kidSoft, in: RoundedRectangle(cornerRadius: 12))
            }

            let rid = tab == 1 ? sideId : (tab == 2 ? (kidId ?? mainId) : mainId)
            if let r = catalog.recipe(rid) {
                RecipeBody(recipe: r)
            } else {
                Text("Resep untuk \(catalog.name(rid)) belum tersedia.").foregroundStyle(Theme.muted)
            }
        }
    }
}

struct RecipeBody: View {
    let recipe: Recipe

    var body: some View {
        let catalog = Catalog.shared
        VStack(alignment: .leading, spacing: 18) {
        VStack(alignment: .leading, spacing: 10) {
            Text("Bahan · \(recipe.name)").font(.title3.weight(.heavy))
            Text("Untuk \(recipe.servings) porsi\(recipe.type == "kid" ? " anak" : "") · \(recipe.timeMinutes) mnt")
                .font(.footnote).foregroundStyle(Theme.muted)
            ForEach(Fmt.categories, id: \.id) { cat in
                let items = recipe.ingredients.filter { catalog.ingredients[$0.id]?.category == cat.id }
                if !items.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(cat.id == "misc" ? "LAINNYA" : cat.label.uppercased())
                            .font(.caption.weight(.bold)).foregroundStyle(Theme.muted)
                        ForEach(items, id: \.self) { ing in
                            let info = catalog.ingredients[ing.id]
                            HStack(alignment: .firstTextBaseline) {
                                Text(info?.name ?? ing.id).font(.subheadline.weight(.semibold))
                                    + Text(ing.note.map { " · \($0)" } ?? "").font(.subheadline).foregroundColor(Theme.muted)
                                Spacer()
                                Text(Fmt.qty(ing.qty, unit: info?.unit ?? "")).font(.subheadline).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card()
                }
            }
        }
        VStack(alignment: .leading, spacing: 14) {
            Text("Langkah memasak").font(.title3.weight(.heavy))
            ForEach(Array(recipe.steps.enumerated()), id: \.offset) { i, step in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(i + 1)").font(.footnote.weight(.heavy)).foregroundStyle(Theme.accent)
                        .frame(width: 28, height: 28).background(Theme.accentSoft, in: Circle())
                    Text(step).font(.body).padding(.top, 3)
                }
            }
        }
        }
    }
}

/// Detail of a day in this week's plan.
struct DayDetailView: View {
    @EnvironmentObject var store: AppStore
    let dayID: UUID

    var body: some View {
        if let plan = store.state.plan, let i = plan.days.firstIndex(where: { $0.id == dayID }) {
            let day = plan.days[i]
            let date = Fmt.dates(from: plan.weekStart)[i]
            let fav = store.isFavorite(day.mainId, day.sideId)
            let catalog = store.catalog
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(Fmt.dayNames[i]), \(Fmt.day(date)) \(Fmt.month(date))\(Fmt.todayIndex(plan.weekStart) == i ? " · Hari ini" : "")")
                            .font(.subheadline.weight(.bold)).foregroundStyle(Theme.accent)
                        Text(catalog.name(day.mainId)).font(.largeTitle.weight(.heavy))
                        Text("+ " + catalog.name(day.sideId)).font(.headline).foregroundStyle(Theme.muted)
                        Text("Anak: " + (day.kidId.map(catalog.name) ?? "sama dengan dewasa")).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.kid)
                    }
                    RecipeTabs(mainId: day.mainId, sideId: day.sideId, kidId: day.kidId)
                }
                .padding(20)
            }
            .background(Theme.bg)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                Button { store.toggleFavorite(day.mainId, day.sideId) } label: {
                    Image(systemName: fav ? "heart.fill" : "heart").foregroundStyle(Theme.heart)
                }
                .accessibilityLabel(fav ? "Hapus dari favorit" : "Tambah ke favorit")
            }
            .safeAreaInset(edge: .bottom) {
                Button { store.state.plan?.days[i].done.toggle() } label: {
                    Label(day.done ? "Sudah dimasak" : "Tandai sudah dimasak", systemImage: "checkmark")
                        .frame(maxWidth: .infinity).frame(height: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(day.done ? Theme.accent.opacity(0.7) : Theme.accent)
                .controlSize(.large)
                .padding(16)
                .background(.bar)
            }
        } else {
            Text("Menu tidak ditemukan.")
        }
    }
}

/// Detail of a favorite set (not tied to a day).
struct FavoriteDetailView: View {
    @EnvironmentObject var store: AppStore
    let key: String

    var body: some View {
        let parts = key.split(separator: "|").map(String.init)
        let mainId = parts.first ?? ""
        let sideId = parts.count > 1 ? parts[1] : ""
        let fav = store.state.favorites.contains(key)
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Set menu favorit").font(.subheadline.weight(.bold)).foregroundStyle(Theme.accent)
                    Text(store.catalog.name(mainId)).font(.largeTitle.weight(.heavy))
                    Text("+ " + store.catalog.name(sideId)).font(.headline).foregroundStyle(Theme.muted)
                }
                RecipeTabs(mainId: mainId, sideId: sideId, kidId: nil)
            }
            .padding(20)
        }
        .background(Theme.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button { store.toggleFavorite(mainId, sideId) } label: {
                Image(systemName: fav ? "heart.fill" : "heart").foregroundStyle(Theme.heart)
            }
        }
    }
}

/// Reorder this week's menus; days stay, menus move.
struct ReorderView: View {
    @EnvironmentObject var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var order: [DayPlan] = []

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(order) { day in
                        let pos = order.firstIndex(of: day) ?? 0
                        HStack(spacing: 12) {
                            if let plan = store.state.plan {
                                DayBadge(index: pos, date: Fmt.dates(from: plan.weekStart)[pos])
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(store.catalog.name(day.mainId)).font(.system(size: 15, weight: .bold))
                                Text("+ " + store.catalog.name(day.sideId)).font(.footnote).foregroundStyle(Theme.muted)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .onMove { order.move(fromOffsets: $0, toOffset: $1) }
                } footer: {
                    Text("Seret menu ke hari lain. Hari tetap di tempatnya — yang berpindah hanya menunya.")
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Atur Urutan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Batal") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Selesai") { store.state.plan?.days = order; dismiss() }.fontWeight(.bold)
                }
                ToolbarItem(placement: .bottomBar) {
                    Button("Kembalikan ke urutan awal") { order = store.state.plan?.days ?? [] }
                        .disabled(order == (store.state.plan?.days ?? []))
                }
            }
            .onAppear { order = store.state.plan?.days ?? [] }
        }
    }
}
