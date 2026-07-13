import Foundation
import MapKit

/// Calcule la distance routière entre deux adresses via MapKit (aucune clé API requise).
struct DistanceService {

    enum DistanceError: LocalizedError {
        case addressNotFound(String)
        case noRoute

        var errorDescription: String? {
            switch self {
            case .addressNotFound(let address):
                return "Adresse introuvable : \(address)"
            case .noRoute:
                return "Aucun itinéraire routier trouvé entre ces deux adresses."
            }
        }
    }

    /// Distance routière aller simple, en kilomètres.
    static func drivingDistanceKm(from origin: String, to destination: String) async throws -> Double {
        let originItem = try await geocode(origin)
        let destinationItem = try await geocode(destination)

        let request = MKDirections.Request()
        request.source = originItem
        request.destination = destinationItem
        request.transportType = .automobile

        let response = try await MKDirections(request: request).calculate()
        guard let route = response.routes.first else {
            throw DistanceError.noRoute
        }
        return route.distance / 1000.0
    }

    private static func geocode(_ address: String) async throws -> MKMapItem {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = address
        if let response = try? await MKLocalSearch(request: request).start(),
           let item = response.mapItems.first {
            return item
        }
        // Repli sur CLGeocoder si MKLocalSearch ne trouve rien.
        let geocoder = CLGeocoder()
        let placemarks = try await geocoder.geocodeAddressString(address)
        guard let location = placemarks.first?.location else {
            throw DistanceError.addressNotFound(address)
        }
        return MKMapItem(placemark: MKPlacemark(coordinate: location.coordinate))
    }
}
