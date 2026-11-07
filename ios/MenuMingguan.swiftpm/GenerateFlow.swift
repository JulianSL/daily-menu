import SwiftUI

/// Three-step sheet: pick menus → shopping list → confirm.
struct GenerateFlow: View {
    @EnvironmentObject var store: AppStore
    @State private var step = 1

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 6) {
                    ForEach(1...3, id: \.self) { n in
                        Capsule().fill(n <= step ? Theme.accent : Theme.line).frame(height: 4)
                    }
                }
                .padding(.horizontal, 20).padding(.top, 4)
                .accessibilityHidden(true)

                Group {
                    switch step {
                    case 1: PickStep()
                    case 2: ShoppingStep()
                    default: ConfirmStep()
                    }
                }
                .frame(maxHeight: .infinity)
            }
            .background(Theme.bg)
            .navigationTitle(["Buat Menu 7 Hari", "Daftar Belanja", "Konfirmasi"][step - 1])
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if step == 1 {
                        Button { store.isGenerating = false } label: { Image(systemName: "xmark") }.accessibilityLabel("Tutup")
                    } else {
                        Button { step -= 1 } label: { Image(systemName: "chevron.left") }.accessibilityLabel("Kembali")
                    }
                }
                ToolbarItem(placement: .primaryAction) { Text("\(step)/3").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted) }
            }
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 10) {
                    if step > 1 {
                        Button("Kembali") { step -= 1 }
                            .buttonStyle(.bordered).controlSize(.large)
                    }
                    Button {
                        if step == 1 { store.prefillPantry() }
                        if step < 3 { step += 1 } else { store.confirmDraft() }
                    } label: {
                        Label(step == 1 ? "Cocok, lanjut ke belanja" : step == 2 ? "Lanjut ke konfirmasi" : "Konfirmasi Menu",
                              systemImage: step == 3 ? "checkmark" : "chevron.right")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                }
                .padding(16)
                .background(.bar)
            }
        }
        .interactiveDismissDisabled(step > 1)
    }
}

// MARK: Step 1

struct PickStep: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        let catalog = store.catalog
        let dates = Fmt.dates(from: store.draftWeekStart)
        let favMains = store.favoriteMainIds
        let mine = store.draft.filter { catalog.mains[$0.mainId]?.source == "user" }.count
        let kidSame = store.draft.filter { store.isKidFriendly($0.mainId) }.count
        let userMains = catalog.data.menus.mains.filter { $0.source == "user" }.count
        let onlineMains = catalog.data.menus.mains.count - userMains

        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("LANGKAH 1 · PILIH MENU").font(.caption.weight(.bold)).foregroundStyle(Theme.accent)
                    Text("Acak ulang yang belum cocok, lalu tandai menu yang aman untuk anak.").font(.subheadline).foregroundStyle(Theme.muted)
                }
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Dari koleksi menumu").font(.footnote.weight(.bold))
                        Text("\(userMains) menu utama + \(catalog.data.menus.sides.count) pendamping milikmu, ditambah \(onlineMains) resep online. Minggu ini \(mine) dari 7 menu dari koleksimu.")
                            .font(.caption)
                    }
                } icon: { Image(systemName: "book").foregroundStyle(Theme.accent) }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 12))

                Toggle(isOn: $store.state.preferFav) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Utamakan menu favorit").font(.subheadline.weight(.bold))
                        Text("\(store.draft.filter { favMains.contains($0.mainId) }.count) dari 7 menu ini favoritmu").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                .padding(12)
                .card()

                HStack {
                    Text("Menu Dewasa").font(.headline.weight(.heavy))
                    Spacer()
                    Button { store.draft = store.generateDays() } label: { Label("Acak semua", systemImage: "shuffle") }
                        .font(.subheadline.weight(.bold))
                }
                .padding(.top, 6)

                ForEach(Array(store.draft.enumerated()), id: \.element.id) { i, d in
                    let m = catalog.mains[d.mainId]
                    let kid = store.isKidFriendly(d.mainId)
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 12) {
                            DayBadge(index: i, date: dates[i])
                            VLine()
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(m?.name ?? d.mainId).font(.system(size: 15, weight: .bold)).lineLimit(2)
                                    if favMains.contains(d.mainId) { Image(systemName: "heart.fill").font(.caption2).foregroundStyle(Theme.heart) }
                                    if m?.source == "online" { OnlineBadge() }
                                }
                                Text("+ " + catalog.name(d.sideId)).font(.footnote).foregroundStyle(Theme.muted)
                            }
                            Spacer(minLength: 0)
                            Button { store.reroll(i) } label: {
                                Image(systemName: "arrow.clockwise").frame(width: 44, height: 44)
                                    .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 12))
                            }
                            .accessibilityLabel("Acak ulang menu \(Fmt.dayNames[i])")
                        }
                        HStack(spacing: 8) {
                            Button { store.toggleKidFriendly(d.mainId) } label: {
                                Label(kid ? "Ramah anak ✓" : "Ramah anak?", systemImage: "face.smiling")
                                    .font(.caption.weight(.bold))
                                    .padding(.horizontal, 10).frame(height: 30)
                                    .foregroundStyle(kid ? Theme.kid : Theme.muted)
                                    .background(kid ? Theme.kidSoft : .white, in: Capsule())
                                    .overlay(Capsule().stroke(kid ? Theme.kid : Color(hex: 0xCFC7B9), style: StrokeStyle(lineWidth: 1.5, dash: kid ? [] : [4, 3])))
                                    .frame(height: 44)
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(kid ? .isSelected : [])

                            Button { store.rerollSide(i) } label: {
                                Label("Ganti pendamping", systemImage: "arrow.clockwise")
                                    .font(.caption.weight(.bold))
                                    .padding(.horizontal, 10).frame(height: 30)
                                    .foregroundStyle(Theme.accent)
                                    .background(.white, in: Capsule())
                                    .overlay(Capsule().stroke(Theme.line, lineWidth: 1.5))
                                    .frame(height: 44)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Ganti pendamping untuk \(m?.name ?? ""), sekarang \(catalog.name(d.sideId))")
                        }
                        .padding(.leading, 53)
                    }
                    .padding(.top, 10).padding(.leading, 12).padding(.trailing, 8).padding(.bottom, 2)
                    .card()
                }

                VStack(alignment: .leading, spacing: 4) {
                    Label("Menu Anak", systemImage: "face.smiling").font(.headline.weight(.heavy)).foregroundStyle(Theme.kid)
                    Text("\(kidSame) hari ikut menu dewasa yang ramah anak · \(7 - kidSame) hari dibuatkan 1 menu utama khusus anak.")
                        .font(.footnote).foregroundStyle(Theme.muted)
                }
                .padding(.top, 10)

                ForEach(Array(store.draft.enumerated()), id: \.element.id) { i, d in
                    let same = store.isKidFriendly(d.mainId)
                    HStack(spacing: 12) {
                        DayBadge(index: i, date: dates[i])
                        VLine()
                        VStack(alignment: .leading, spacing: 2) {
                            Text(same ? "IKUT MENU DEWASA" : "KHUSUS ANAK").font(.system(size: 10, weight: .heavy))
                                .foregroundStyle(same ? Theme.muted : Theme.kid)
                            Text(same ? catalog.name(d.mainId) : catalog.name(d.kidMenuId)).font(.system(size: 15, weight: .bold))
                        }
                        Spacer(minLength: 0)
                        if !same {
                            Button { store.rerollKid(i) } label: {
                                Image(systemName: "arrow.clockwise").foregroundStyle(Theme.kid).frame(width: 44, height: 44)
                                    .background(Theme.kidSoft, in: RoundedRectangle(cornerRadius: 12))
                            }
                            .accessibilityLabel("Acak ulang menu anak \(Fmt.dayNames[i])")
                        }
                    }
                    .padding(.vertical, 10).padding(.leading, 12).padding(.trailing, 8)
                    .frame(minHeight: 66)
                    .card(border: same ? Theme.line : Color(hex: 0xF2B8D0), lineWidth: same ? 1 : 1.5)
                }
            }
            .padding(16)
        }
    }
}

// MARK: Step 2

struct ShoppingStep: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        let cats = store.shopping(for: store.draftAsPlan)
        let total = cats.reduce(0) { $0 + $1.items.count }
        let have = store.draftHave.values.filter { $0 }.count
        ShoppingList(
            categories: cats,
            header: "\(total) bahan untuk menu dewasa & anak · centang yang sudah ada di dapur (\(have) sudah ada). Setelah konfirmasi, daftar ini tersimpan di tab Belanja.",
            isChecked: { store.draftHave[$0] == true },
            toggle: { store.draftHave[$0] = !(store.draftHave[$0] ?? false) },
            hideChecked: false
        )
    }
}

// MARK: Step 3

struct ConfirmStep: View {
    @EnvironmentObject var store: AppStore

    var body: some View {
        let dates = Fmt.dates(from: store.draftWeekStart)
        let cats = store.shopping(for: store.draftAsPlan)
        let need = cats.reduce(0) { n, c in n + c.items.filter { store.draftHave[$0.id] != true }.count }
        let kidAuto = store.draft.filter { !store.isKidFriendly($0.mainId) }.count
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Siap untuk minggu depan?").font(.title2.weight(.heavy))
                VStack(alignment: .leading, spacing: 14) {
                    Label("Senin, \(Fmt.day(dates[0])) \(Fmt.month(dates[0])) – Minggu, \(Fmt.day(dates[6])) \(Fmt.month(dates[6]))", systemImage: "calendar")
                        .font(.subheadline.weight(.semibold))
                    HStack(spacing: 8) {
                        SummaryNumber(value: 7, label: "set menu dewasa")
                        SummaryNumber(value: kidAuto, label: "menu khusus anak")
                        SummaryNumber(value: need, label: "bahan perlu dibeli")
                    }
                }
                .foregroundStyle(.white)
                .padding(18)
                .background(Theme.accent, in: RoundedRectangle(cornerRadius: 18))

                VStack(spacing: 0) {
                    ForEach(Array(store.draft.enumerated()), id: \.element.id) { i, d in
                        HStack(alignment: .top, spacing: 12) {
                            Text("\(Fmt.dayLabel[i]) \(Fmt.day(dates[i]))").font(.footnote.weight(.bold)).foregroundStyle(Theme.muted).frame(width: 64, alignment: .leading)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(store.catalog.name(d.mainId)).font(.subheadline.weight(.bold))
                                Text("+ " + store.catalog.name(d.sideId)).font(.caption).foregroundStyle(Theme.muted)
                                Text("Anak: " + (store.kidId(for: d).map(store.catalog.name) ?? "ikut menu dewasa")).font(.caption.weight(.semibold)).foregroundStyle(Theme.kid)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        if i < 6 { Divider() }
                    }
                }
                .card()

                Label("Urutan hari masih bisa diatur ulang dari Beranda, dan daftar belanja tetap tersimpan di tab Belanja selama seminggu.", systemImage: "info.circle")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            .padding(16)
        }
    }
}

struct SummaryNumber: View {
    let value: Int
    let label: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.title2.weight(.heavy))
            Text(label).font(.caption.weight(.semibold))
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 12))
    }
}
