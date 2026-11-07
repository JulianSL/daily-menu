import SwiftUI

/// Grouped checklist used by the Belanja tab and step 2 of the generate flow.
struct ShoppingList: View {
    let categories: [ShoppingCategory]
    let header: String?
    let isChecked: (String) -> Bool
    let toggle: (String) -> Void
    let hideChecked: Bool

    var body: some View {
        List {
            if let header {
                Section { Text(header).font(.subheadline).foregroundStyle(Theme.muted) }
            }
            ForEach(categories) { cat in
                let rows = cat.items.filter { !(hideChecked && isChecked($0.id)) }
                let left = cat.items.filter { !isChecked($0.id) }.count
                Section {
                    if rows.isEmpty {
                        Text("Semua \(cat.label.lowercased()) sudah beres").font(.footnote).foregroundStyle(Theme.muted)
                    }
                    ForEach(rows) { item in
                        let on = isChecked(item.id)
                        Button { toggle(item.id) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: on ? "checkmark.square.fill" : "square")
                                    .font(.title3)
                                    .foregroundStyle(on ? Theme.accent : Color(hex: 0xA39B8E))
                                VStack(alignment: .leading, spacing: 1) {
                                    HStack(spacing: 6) {
                                        Text(item.name).font(.body.weight(.semibold)).strikethrough(on)
                                        if item.pantry {
                                            Text("stok dapur").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.muted)
                                                .padding(.horizontal, 5).overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: 0xD3CCBF)))
                                        }
                                    }
                                    Text("untuk \(item.use)").font(.caption).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                Text(item.qty).font(.subheadline.weight(.bold)).strikethrough(on)
                            }
                            .foregroundStyle(on ? Theme.muted : Theme.ink)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                } header: {
                    HStack {
                        Text(cat.label).font(.headline.weight(.heavy)).foregroundStyle(Theme.ink).textCase(nil)
                        Spacer()
                        Text("\(left) lagi").font(.caption.weight(.semibold)).textCase(nil)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
    }
}

struct ShoppingView: View {
    @EnvironmentObject var store: AppStore
    @State private var hideChecked = false

    var body: some View {
        Group {
            if let plan = store.state.plan {
                let cats = store.planShopping
                let total = cats.reduce(0) { $0 + $1.items.count }
                let bought = total - store.itemsLeft
                VStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Untuk menu \(Fmt.range(plan.weekStart))").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                        Text("\(bought) dari \(total) sudah dibeli").font(.subheadline.weight(.bold))
                        ProgressView(value: total == 0 ? 0 : Double(bought) / Double(total)).tint(Theme.accent)
                    }
                    .padding(16)
                    ShoppingList(
                        categories: cats,
                        header: nil,
                        isChecked: { store.state.shopping[$0] == true },
                        toggle: { store.state.shopping[$0] = !(store.state.shopping[$0] ?? false) },
                        hideChecked: hideChecked
                    )
                }
                .toolbar {
                    Button(hideChecked ? "Tampilkan semua" : "Sembunyikan yang dibeli") { hideChecked.toggle() }
                }
            } else {
                ContentUnavailableView {
                    Label("Daftar belanja masih kosong", systemImage: "bag")
                } description: {
                    Text("Daftar belanja dibuat otomatis dari 7 menu yang kamu pilih, dan tetap tersimpan di sini selama seminggu.")
                } actions: {
                    Button("Buat Menu 7 Hari") { store.startGenerating() }.buttonStyle(.borderedProminent)
                }
            }
        }
        .background(Theme.bg)
        .navigationTitle("Belanja")
    }
}

struct FavoritesView: View {
    @EnvironmentObject var store: AppStore
    @State private var query = ""

    var body: some View {
        let catalog = store.catalog
        let items = store.state.favorites.filter { key in
            guard !query.isEmpty else { return true }
            let p = key.split(separator: "|").map(String.init)
            return (p.map(catalog.name).joined(separator: " ")).localizedCaseInsensitiveContains(query)
        }
        List {
            if items.isEmpty {
                Text(query.isEmpty ? "Belum ada favorit. Ketuk ♥ pada menu untuk menyimpannya di sini." : "Tidak ada favorit yang cocok.")
                    .foregroundStyle(Theme.muted)
            }
            ForEach(items, id: \.self) { key in
                let p = key.split(separator: "|").map(String.init)
                NavigationLink {
                    FavoriteDetailView(key: key)
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(catalog.name(p.first ?? "")).font(.body.weight(.bold))
                        if p.count > 1 { Text("+ " + catalog.name(p[1])).font(.footnote).foregroundStyle(Theme.muted) }
                        if let r = catalog.recipe(p.first ?? "") {
                            Label("\(r.timeMinutes) mnt", systemImage: "clock").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .swipeActions {
                    Button(role: .destructive) {
                        store.state.favorites.removeAll { $0 == key }
                    } label: { Label("Hapus", systemImage: "heart.slash") }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
        .searchable(text: $query, prompt: "Rawon, soto, ayam…")
        .navigationTitle("Favorit")
        .toolbar {
            Text("\(store.state.favorites.count) set").font(.footnote).foregroundStyle(Theme.muted)
        }
    }
}
