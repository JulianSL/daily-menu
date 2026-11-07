import SwiftUI

struct HomeView: View {
    @EnvironmentObject var store: AppStore
    @Binding var selectedTab: Int
    @State private var confirmNew = false
    @State private var showReorder = false

    var body: some View {
        Group {
            if let plan = store.state.plan {
                planView(plan)
            } else {
                EmptyHomeView(selectedTab: $selectedTab)
            }
        }
        .background(Theme.bg)
        .navigationTitle(store.state.plan == nil ? "Menu Mingguan" : "Minggu Ini")
        .toolbar {
            if store.state.plan != nil {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { confirmNew = true } label: { Image(systemName: "sparkles") }
                        .accessibilityLabel("Buat menu baru")
                    Button { showReorder = true } label: { Label("Atur", systemImage: "arrow.up.arrow.down") }
                }
            }
        }
        .confirmationDialog("Buat menu baru? Menu dan daftar belanja minggu ini akan diganti.", isPresented: $confirmNew, titleVisibility: .visible) {
            Button("Buat menu baru") { store.startGenerating() }
            Button("Batal", role: .cancel) {}
        }
        .sheet(isPresented: $showReorder) {
            ReorderView().environmentObject(store)
        }
    }

    @ViewBuilder
    private func planView(_ plan: WeekPlan) -> some View {
        let dates = Fmt.dates(from: plan.weekStart)
        let today = Fmt.todayIndex(plan.weekStart)
        let done = plan.days.filter(\.done).count
        let cats = store.planShopping
        let total = cats.reduce(0) { $0 + $1.items.count }
        let left = store.itemsLeft

        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(Fmt.range(plan.weekStart)).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                HStack(spacing: 10) {
                    StatCard(label: "Sudah dimasak", value: "\(done)", suffix: " / 7", progress: Double(done) / 7)
                    Button { selectedTab = 1 } label: {
                        StatCard(label: "Daftar belanja", value: "\(left)", suffix: " lagi", progress: total == 0 ? 0 : Double(total - left) / Double(total), chevron: true)
                    }
                    .buttonStyle(.plain)
                }
                VStack(spacing: 8) {
                    ForEach(Array(plan.days.enumerated()), id: \.element.id) { i, day in
                        PlanRow(index: i, date: dates[i], day: day, isToday: today == i)
                    }
                }
            }
            .padding(16)
        }
    }
}

struct StatCard: View {
    let label: String
    let value: String
    let suffix: String
    let progress: Double
    var chevron = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                Spacer()
                if chevron { Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Theme.muted) }
            }
            (Text(value).font(.title3.weight(.heavy)) + Text(suffix).font(.subheadline.weight(.bold)).foregroundColor(Theme.muted))
            ProgressView(value: progress).tint(Theme.accent)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

struct PlanRow: View {
    @EnvironmentObject var store: AppStore
    let index: Int
    let date: Date
    let day: DayPlan
    let isToday: Bool

    var body: some View {
        let catalog = store.catalog
        let fav = store.isFavorite(day.mainId, day.sideId)
        HStack(spacing: 10) {
            NavigationLink {
                DayDetailView(dayID: day.id)
            } label: {
                HStack(spacing: 12) {
                    DayBadge(index: index, date: date, highlight: isToday)
                    VLine()
                    VStack(alignment: .leading, spacing: 2) {
                        if isToday { Text("HARI INI").font(.system(size: 10, weight: .heavy)).foregroundStyle(Theme.accent) }
                        Text(catalog.name(day.mainId))
                            .font(.system(size: 15, weight: .bold))
                            .strikethrough(day.done)
                            .foregroundStyle(day.done ? Theme.muted : Theme.ink)
                            .lineLimit(2)
                        Text("+ " + catalog.name(day.sideId)).font(.footnote).foregroundStyle(Theme.muted).lineLimit(1)
                        Text("Anak: " + (day.kidId.map(catalog.name) ?? "sama")).font(.caption.weight(.semibold)).foregroundStyle(Theme.kid).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button { store.toggleFavorite(day.mainId, day.sideId) } label: {
                Image(systemName: fav ? "heart.fill" : "heart").foregroundStyle(fav ? Theme.heart : Theme.muted)
                    .frame(width: 40, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(fav ? "Hapus dari favorit" : "Tambah ke favorit")

            Button { toggleDone() } label: {
                ZStack {
                    Circle().stroke(day.done ? .clear : Color(hex: 0xCFC7B9), lineWidth: 2)
                    if day.done {
                        Circle().fill(Theme.accent)
                        Image(systemName: "checkmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(.white)
                    }
                }
                .frame(width: 30, height: 30)
                .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(day.done ? "Batalkan tanda sudah dimasak" : "Tandai sudah dimasak")
        }
        .padding(.vertical, 6).padding(.leading, 12).padding(.trailing, 6)
        .card(border: isToday ? Theme.accent : Theme.line, lineWidth: isToday ? 2 : 1)
    }

    private func toggleDone() {
        guard let i = store.state.plan?.days.firstIndex(where: { $0.id == day.id }) else { return }
        store.state.plan?.days[i].done.toggle()
    }
}

struct EmptyHomeView: View {
    @EnvironmentObject var store: AppStore
    @Binding var selectedTab: Int

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Minggu depan · " + Fmt.range(Fmt.upcomingMonday()))
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                VStack(alignment: .leading, spacing: 20) {
                    Image(systemName: "calendar").font(.title2).foregroundStyle(Theme.accent)
                        .frame(width: 52, height: 52).background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 16))
                    Text("Belum ada menu untuk minggu ini").font(.title2.weight(.heavy))
                    Text("Buat 7 set menu rumahan — satu lauk utama dan satu pendamping per hari, plus menu anak — lengkap dengan daftar belanjanya.")
                        .foregroundStyle(Theme.muted)
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(["Pilih 7 set menu yang cocok", "Cek daftar belanja per kategori", "Konfirmasi, lalu mulai masak"].enumerated()), id: \.offset) { i, t in
                            Label { Text(t).font(.subheadline.weight(.semibold)) } icon: {
                                Text("\(i + 1)").font(.caption.weight(.bold)).frame(width: 26, height: 26).background(Color(hex: 0xF1ECE3), in: Circle())
                            }
                        }
                    }
                    Button { store.startGenerating() } label: {
                        Label("Buat Menu 7 Hari", systemImage: "sparkles").frame(maxWidth: .infinity).frame(height: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
                .padding(24)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 22))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(Theme.line))

                if !store.state.favorites.isEmpty {
                    HStack {
                        Text("Dari favoritmu").font(.headline)
                        Spacer()
                        Button("Lihat semua") { selectedTab = 2 }.font(.subheadline.weight(.semibold))
                    }
                }
            }
            .padding(20)
        }
    }
}
