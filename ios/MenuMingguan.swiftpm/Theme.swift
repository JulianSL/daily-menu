import SwiftUI

enum Theme {
    static let bg = Color(hex: 0xF7F4EE)
    static let surface = Color.white
    static let ink = Color(hex: 0x1C1A17)
    static let muted = Color(hex: 0x6B645A)
    static let line = Color(hex: 0xE6E0D5)
    static let accent = Color(hex: 0x2E6A4A)
    static let accentSoft = Color(hex: 0x2E6A4A).opacity(0.12)
    static let heart = Color(hex: 0xB4531F)
    static let heartSoft = Color(hex: 0xFBE9DF)
    static let kid = Color(hex: 0xB3306B)
    static let kidSoft = Color(hex: 0xFCE4EF)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// White rounded card used for menu rows.
struct CardBackground: ViewModifier {
    var border: Color = Theme.line
    var lineWidth: CGFloat = 1
    func body(content: Content) -> some View {
        content
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(border, lineWidth: lineWidth))
    }
}

extension View {
    func card(border: Color = Theme.line, lineWidth: CGFloat = 1) -> some View {
        modifier(CardBackground(border: border, lineWidth: lineWidth))
    }
}

/// "SEN / 9" column on the left of every menu row.
struct DayBadge: View {
    let index: Int
    let date: Date
    var highlight = false
    var body: some View {
        VStack(spacing: 1) {
            Text(Fmt.dayShort[index]).font(.system(size: 11, weight: .bold)).tracking(0.4)
            Text("\(Fmt.day(date))").font(.system(size: 19, weight: .heavy))
        }
        .foregroundStyle(highlight ? Theme.accent : Theme.ink)
        .frame(width: 40)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(Fmt.dayNames[index]) \(Fmt.day(date))")
    }
}

struct VLine: View {
    var body: some View { Rectangle().fill(Color(hex: 0xEFEAE1)).frame(width: 1) }
}

struct OnlineBadge: View {
    var body: some View {
        Text("ONLINE")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 5).padding(.vertical, 1)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: 0xD3CCBF)))
    }
}
