import SwiftUI

@main
struct MenuMingguanApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(Theme.accent)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var store: AppStore
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { HomeView(selectedTab: $tab) }
                .tabItem { Label("Minggu Ini", systemImage: "calendar") }
                .tag(0)
            NavigationStack { ShoppingView() }
                .tabItem { Label("Belanja", systemImage: "bag") }
                .badge(store.itemsLeft)
                .tag(1)
            NavigationStack { FavoritesView() }
                .tabItem { Label("Favorit", systemImage: "heart") }
                .tag(2)
        }
        .sheet(isPresented: $store.isGenerating) {
            GenerateFlow()
                .environmentObject(store)
        }
    }
}
